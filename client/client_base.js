// configuration needs to be done in each client instance file. 
var myenv = {}; ////////////////////
function set_myenv(){
	console.log('## set_myenv');
	var env = require('../env.json');
	var node_env = process.env.NODE_ENV || 'development';
	if ((['development', 'production'].indexOf(node_env)) == -1) {
		var msg = '!! process.env.NODE_ENV should from [undefined, development, production]';
		console.log(msg);
		process.exit(1);
	}
	myenv = env[node_env];
	console.log("## client env: ", node_env); 
	console.log(myenv);
	console.log()
}
var my_job_settings = {}; /////////////////////
function set_my_job_settings(job_settings) {
	console.log('## set_my_job_settings', job_settings);
}
var my_job_target = ''; /////////////////////
function set_my_job_target(job_target) {
	console.log('## set_my_job_target', job_target);
	my_job_target = job_target;
}
function set_folder(){
	myutil.folder_init(myenv['data_row_path'], my_job_target);
}

//console.log('reading configuration ...');
var myconfig = require('./CONFIG.js');
var myutil = require('./myutil.js');

// mongodb
var MongoClient = require('mongodb').MongoClient;
var mongodb_url = '';
function get_mongodb_url(){
	mongodb_url = 'mongodb://'+myenv['mongodb_client_address']+'/'+myenv['mongodb_client_name'];
	console.log(mongodb_url, 'cool');
	return mongodb_url;
}
var ObjectID = require('mongodb').ObjectID;

// others
var events = require('events');
var eventEmitter = new events.EventEmitter();
var os = require('os');
var querystring = require('querystring');
var fs = require('fs');


console.log("## hello client, ", os.hostname(), "##");

function db_opt(db_callback){
	console.log('999');
	mongodb_url = get_mongodb_url()
	MongoClient.connect(mongodb_url, function(err, db){
		console.log('00000');
		if (err) {
			console.log('111111');
			throw err;
			console.error(err.red.bold)
			//db_opt(db_callback)
		} else {
			console.log('222222');
			db.on('error', function(err){
				console.log('== mongodb error event:', err);
			});
			console.log('wwwwwwwwwww');
			db_callback(db);
		}
	});
	console.log('88888');
}


function error_log(job_step, function_name, error_message, error_argus){
	url_query = querystring.stringify({
		'client_id':myconfig.my_client_id, 
		'job_step':job_step,
		'job_target': my_job_target,
		'function_name': function_name,
		'error_message': error_message,
		'error_argus': error_argus
	});
	uri = myconfig.job_server_address+'/error_log?'+url_query;
	var vars = {uri:uri, job_step:'jobs_get'};
	console.log('** client_jobs_get', vars.uri);
	myutil.request_get_http(vars, 
		function(http_statusCode, vars, resp, body){console.log(http_statusCode, vars)}, 
		function(e, vars){console.log(e, vars)}
		);
}


/////////////////////////
//////// event
/////////////////////////
var i_tries = 0;
var i_tries_0 = 0;
eventEmitter.on('jobs.length=0', function(job_step){
	console.log("jobs.length=0: %s".blue.italic, job_step)
	i_tries ++;
	i_tries_0 ++;
	console.log('tried: '.yellow, i_tries, i_tries_0);
	if (i_tries > job_settings.connection_try_max || i_tries_0 > job_settings.connection_try_max ) {
		return
	}
	// should log error here as they are actually not error
	//error_log(job_step, 'jobs.length=0', 'jobs.length=0', 'jobs.length=0');
	switch(job_step){
		case 'jobs_get':
			console.error("FINISH: jobs_get_no_more_job".blue.bold)
			setTimeout(client_jobs_do, job_settings.web_access_interval);
			//client_jobs_do();
			break;
		case 'jobs_do':
			client_jobs_put();
			break;
		case 'jobs_put':
			client_jobs_settings_get();
			break;
	}		
});

eventEmitter.on('http_connect_wrong_status', function(job_step, http_statusCode){
	console.error("ERROR: client_%s_get_resp_callback".red.bold, job_step, http_statusCode);
	i_tries ++;
	console.log('tried: '.yellow, i_tries);
	if (i_tries > job_settings.connection_try_max) {
		return
	}
	error_log(job_step, job_step, 'http_connect_wrong_status', http_statusCode);
	switch(job_step) {
		case 'jobs_settings':
			client_jobs_get();
			break
		case 'jobs_get':
			client_jobs_do();
			break
		case 'jobs_do':
			client_jobs_put();
			break
		case 'jobs_put':
			client_jobs_settings_get();
			break
		default:
			client_jobs_settings_get();
	}
});
function http_connect_error(e, vars){
	eventEmitter.emit('http_connect_error', vars.job_step, e);
}
eventEmitter.on('http_connect_error', function(job_step, e){
	console.error("ERROR: client_%s_get_err_callback".red.bold, job_step, e)
	i_tries ++;
	console.log('tried: '.yellow, i_tries);
	if (i_tries > job_settings.connection_try_max) {
		return
	}
	error_log(job_step, 'http_connect_wrong_status', e.toString(), e.toString());
	switch(job_step) {
		case 'jobs_settings':
			client_jobs_get();
			break
		case 'jobs_get':
			client_jobs_do();
			break
		case 'jobs_do':
			client_jobs_put();
			break
		case 'jobs_put':
			client_jobs_settings_get();
			break
		default:
			client_jobs_settings_get();
	}
});
eventEmitter.on('job_step_done', function(job_step){
	i_tries = 0;
	console.log("DONE: %s".blue.italic, job_step)
	switch(job_step) {
		case 'jobs_do':
			client_jobs_put();
			break
		case 'jobs_settings':
			i_tries = 0;
			client_jobs_get();
			break
		case 'jobs_get':
			i_tries = 0;
			client_jobs_do();
			break
		case 'jobs_init':
		case 'jobs_put':
			i_tries = 0;
			client_jobs_settings_get();
			break
		default:
			client_jobs_settings_get();
	}
});

eventEmitter.on('ejdb_error', function(action, job_step){
	// did not figure out action: save, update, etc
	console.error("ERROR: ejdb, %s".red.bold, job_step)
	i_tries ++;
	console.log('tried: '.yellow, i_tries);
	if (i_tries > job_settings.connection_try_max) {
		return
	}
	error_log(job_step, action, 'ejdb_error', '')
	switch(job_step) {
		case 'jobs_settings':
			client_jobs_get();
			break
		case 'jobs_get':
			client_jobs_do();
			break
		case 'jobs_do':
			client_jobs_put();
			break
		case 'jobs_put':
			client_jobs_settings_get();
			break
		default:
			client_jobs_settings_get();
	}
	// needs to restart the services, 
});

eventEmitter.on('fs_error', function(action, job_step){
	// did not figure out action: save, update, etc
	console.error("ERROR: fs, %s".red.bold, job_step)
	i_tries ++;
	console.log('tried: '.yellow, i_tries);
	if (i_tries > job_settings.connection_try_max) {
		return
	}
	switch(job_step) {
		case 'jobs_settings':
			client_jobs_get();
			break
		case 'jobs_get':
			client_jobs_do();
			break
		case 'jobs_do':
			client_jobs_put();
			break
		case 'jobs_put':
			client_jobs_settings_get();
			break
		default:
			client_jobs_settings_get();
	}
	// needs to restart the services, 
});

///////////////////////
///////// jobs_settings
///////////////////////
function client_jobs_settings_get(){
	console.log('================ jobs_setting_get ==========================='.blue.italic);
	client_jobs_settings_get_cp(client_jobs_settings_get_resp_callback, http_connect_error);
}
function client_jobs_settings_get_cp(resp_callback, err_callback){
	url_query = querystring.stringify({
		'settings_action':myutil.jobs_settings_actions.view
	});
	uri = myenv['job_server_address']+'/jobs_settings?'+url_query;
	var vars = {uri:uri, job_step:'jobs_settings'};
	//console.log('** client_jobs_settings_get', vars.uri);
	myutil.request_get_http(vars, resp_callback, err_callback);
}
function client_jobs_settings_get_resp_callback(http_statusCode, vars, resp, body){
	if (http_statusCode != 200) {
		eventEmitter.emit('http_connect_wrong_status', vars.job_step, http_statusCode);
		return
	}
	client_jobs_update(body);
	console.log(my_job_settings)
	eventEmitter.emit('job_step_done', vars.job_step);
}
function client_jobs_settings_get_body_process(body){
	var jobs_settings = JSON.parse(body);
	for (var i = 0; i < jobs_settings.length; i++ ){
		var jobs_setting = jobs_settings[i];
		if (jobs_setting.job_target == my_job_target) {
			my_job_settings[jobs_setting['settings_key']] = parseInt(jobs_setting['settings_value']);
		}
	}
}
function get_my_job_settings(){
	return my_job_settings;
}

///////////////////////
//////// jobs_get
///////////////////////
function client_jobs_get(){
	console.log('================ jobs_get ==========================='.blue.italic);
	client_jobs_get_cp(client_jobs_get_resp_callback, http_connect_error)
}
function client_jobs_get_cp(resp_callback, err_callback){
	url_query = querystring.stringify({
		'client_id':os.hostname(), 
		'client_job_request_count':my_job_settings.client_job_request_count,
		'job_target': my_job_target
	});
	uri = myenv['job_server_address']+'/jobs_get?'+url_query;
	var vars = {uri:uri, job_step:'jobs_get'};
	//console.log('** client_jobs_get', vars.uri)
	myutil.request_get_http(vars, resp_callback, err_callback);
}
function client_jobs_get_resp_callback(http_statusCode, vars, resp, body){
	if (http_statusCode != 200) {
		eventEmitter.emit('http_connect_wrong_status', vars.job_step, http_statusCode);
		return
	}
	var jobs = JSON.parse(body);
	console.log(jobs.length)
	if (jobs.length == 0){
		eventEmitter.emit('jobs.length=0', vars.job_step);
		return
	} else {
		i_tries_0 = 0;
		client_jobs_get_db_save(my_job_target, jobs, 
			function(){
				eventEmitter.emit('ejdb_error', 'save', vars.job_step);
			}, 
			function(){
				eventEmitter.emit('job_step_done', vars.job_step);
			});
	}
}
function client_jobs_get_db_save(jobs, err_callback, callback){
	console.log(my_job_target, 'hello');
	db_opt(function(db){
		console.log(my_job_target, 'world');
		db.collection(my_job_target).save(jobs, function(err){
			db.close();
			if (err) {
				err_callback();
				return
			} else {
				callback();
				return
			}
		});
	});
}

///////////////////////
////////// jobs_put
///////////////////////
var jobs_put_t = 0;
function client_jobs_put(){
	jobs_put_t = 0;
	console.log('================ jobs_put ==========================='.blue.italic);
	db_opt(function(db){
		var query = db.collection(my_job_target)
			.find({})
			.toArray(function(err, docs){
				db.close();
				if (err) {
					eventEmitter.emit('ejdb_error', 'find', 'jobs_put');
					return
				}
				if (docs.length == 0) {
					// next job
					console.error('jobs_put'.red.bold, "count == 0");
					eventEmitter.emit('jobs.length=0', 'jobs_put');
					return;
				} else {
					jobs = docs;
					console.log("** client_jobs_put Found "+ docs.length);
					client_jobs_put_request(jobs);
				}
			});
	});
}
function client_jobs_put_i(){
	console.log('================ jobs_put_i ==========================='.blue.italic);
	ejdb.find(my_job_target, {}, function(err, cursor, count) {
		if (err) {
			eventEmitter.emit('ejdb_error', 'find', 'jobs_put');
				return
		}
		if (count == 0) {
			// next job
			console.error('jobs_put'.red.bold, "count == 0");
			eventEmitter.emit('jobs.length=0', 'jobs_put');
			return;
		} else {
			i_tries_0 = 0;
			jobs = []
			console.log("** client_jobs_put Found "+ count);
			var i = 0;
			while (cursor.next()) {
				i = i + 1;
				if (i > 10) {
					break;
				}
				jobs.push(cursor.object());
			}
			cursor.close();
			client_jobs_put_request(jobs);
		}
	});
}

function client_jobs_put_request(jobs) {
	var post_body = {
		'client_id':myconfig.my_client_id, 
		'job_target': my_job_target,
		'jobs': jobs
	};
	post_body = JSON.stringify(post_body);
	uri = myconfig.job_server_address+'/jobs_put';
	var vars = {uri:uri, post_body: post_body};
	console.log('** client_jobs_put_request', vars.uri, jobs.length)
	myutil.request_post_http(vars, client_jobs_put_resp_callback, http_connect_error);
}

function client_jobs_put_resp_callback(http_statusCode, vars, resp, body){
	console.log('e3');
	//console.log('e3e3', body, 'e4e4');
	if (body.indexOf('Error: Request Entity Too Large') > -1) {
		client_jobs_put_i ();
		return 
	}
	jobs = JSON.parse(body);
	console.log('e4');
	console.log(jobs.length);
	if (jobs.length == 0){
		console.error('client_jobs_put_resp_callback'.red.bold, 'jobs.length == 0')
		eventEmitter.emit('jobs.length=0', 'jobs_put'); // futher error division
	} else {
		i_tries_0 = 0;
		client_jobs_bulk_remove(jobs, 0);
	}
}

function client_jobs_bulk_remove(jobs, i){
	if ( i < jobs.length ) {
		ejdb.remove(my_job_target, jobs[i]._id, function(err){
			if (err) {
				console.error('client_jobs_bulk_remove'.red.bold, 'ejdb.remove');
				eventEmitter.emit('ejdb_error', 'remove', 'jobs_put');
				return
			} else {
				i = i + 1
				client_jobs_bulk_remove(jobs, i);
			}
		});
	} else {
		jobs_put_t = jobs_put_t - i;
		console.log('jobs_remove', i, jobs_put_t);
		if (i >= jobs_put_t) {
			eventEmitter.emit('job_step_done', 'jobs_put');
		} else {
			setTimeout(client_jobs_put_i, job_settings.web_access_interval*2);
		}
	}
}


///////////////////////
////////// jobs_do 
///////////////////////
function client_jobs_do(){
	console.log('================ jobs_do ==========================='.blue.italic);
	client_jobs_do_single();
}
function client_jobs_do_single () {
	ejdb.findOne(my_job_target, {'job_status': {$lte: myutil.job_status_figure.unread}}, function(err, obj) {
		if (err) {
			eventEmitter.emit('ejdb_error', 'findOne', 'jobs_do');
			return;
		}
		if (obj == null) {
			// next job, no object founded
			console.error('== client_jobs_do_single'.yellow.bold, "count == 0");
			eventEmitter.emit('jobs.length=0', 'jobs_do');
		} else {
			i_tries_0 = 0;
			client_jobs_do_download(obj);
		}
	});
}

function client_jobs_do_download(job){
	var vars = {uri:job.job_url, job_file_path:job.job_file_path, job:job, job_step:'jobs_do'};
	console.log('** client_jobs_do_download', vars.uri, vars.job_file_path, job._id, job.job_id);
	myutil.request_get_http(vars, client_jobs_do_resp_callback, client_jobs_do_err_callback);
}

function client_jobs_do_resp_callback(http_statusCode, vars, resp, body){
	console.log(http_statusCode, 'client_jobs_do_resp_callback');
	fs.writeFile(vars.job_file_path, body, function(err){
		if (err) {
			eventEmitter.emit('fs_error', 'writeFile', vars.job_step);
			return
		} else {
			client_job_do_update(vars.job, http_statusCode, myutil.job_status_figure.done)
		}
	});
}

function client_jobs_do_err_callback(error, vars){
	console.log(error);
	if (error.message == 'Parse Error') {
		// this error can be ignored
		console.log('this error can be ignored ======1'.red);
	} else if (error.message == 'connect ECONNREFUSED') {
		// this error can be ignored
		console.log('this error can be ignored ======2'.red);
	}else {
		// err would already set -1 for http_status in db
		client_job_do_update(vars.job, -1, myutil.job_status_figure.error_when_reading);
		// should I emit a error event and also update with sever
	}
}

function client_job_do_update(job, http_statusCode, job_status){
	job.http_status = http_statusCode;
	job.update_date = new Date().toGMTString();
	job.job_status = job_status;
	job.client_id = myconfig.my_client_id;
	ejdb.save(my_job_target, job, function(err, oid){
		if (err) {
			eventEmitter.emit('ejdb_error', 'save', vars.job_step);
			return
		} else {
			setTimeout(client_jobs_do_single, job_settings.web_access_interval);
			return
		}
	});
}


function client_jobs_init(){
	//eventEmitter.emit('job_step_done', 'jobs_init');
	eventEmitter.emit('job_step_done', 'jobs_do');
}

function main(){
	client_jobs_init();
}

// it will only be used when solo file
//main();

/////////
// configuration
module.exports.set_my_job_settings = set_my_job_settings;
module.exports.set_my_job_target = set_my_job_target;
module.exports.set_myenv = set_myenv;
module.exports.set_folder = set_folder;
// job_settings
module.exports.client_jobs_settings_get_cp = client_jobs_settings_get_cp;
module.exports.client_jobs_settings_get_body_process = client_jobs_settings_get_body_process;
module.exports.get_my_job_settings = get_my_job_settings;
// jobs_get
module.exports.client_jobs_get_cp = client_jobs_get_cp;
module.exports.client_jobs_get_db_save = client_jobs_get_db_save;
//main
module.exports.main = main;
/////////

