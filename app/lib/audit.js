/*eslint no-console: ["warn", { allow: ["log"] }] */

var fs = require('fs');

function logger(key){
    this.key = key;
    this.records = [];
    this.validated_records = 0;
    this.needs_header = true;
}

logger.prototype.append = function(row, match, result){
    if (!this.records){
        console.log(this.key + ' called append after flush() ' +
                    JSON.stringify(Array.prototype.slice.call(arguments, 0), null, 2));
        this.records = [];
    }
    this.records.push([row, match, result]);
}

logger.prototype.flush = function(i){
    //console.log('audit: ' + this.key + ' => flush(i:' + i + ')');
    if (process.env.DISABLE_AUDIT){
        return;
    }
    if (!this.records){
        console.log(this.key + ' attempt to call flush() twice in a row');
        return;
    }
    var ok = true;
    var sql_ok = true;
    i = i || 0;
    if (this.needs_header){
        ok = file.write(
            this.key + '\n' +
            format_headings(this.records[0])
        );
        sql_ok = file_sql.write("INSERT INTO mdl_log (time,userid,ip,course,module,cmid,action,url,info) VALUES ");
        this.needs_header = false;
    }
    while (ok && sql_ok && i < this.records.length){
        ok = file.write(format_record(this.records[i]));
        sql_ok = file_sql.write(format_sql_record(this.records[i]));
        var valid = validate_record(this.records[i], this.key, i);        
        if(valid) {
            this.validated_records++;
        }
        if (process.env.LOSSY_AUDIT){
            i += i;
        }
        i++;
    }
    if (i < this.records.length){
        file.once('drain', () => { this.flush(i) });
    }else{
        console.log('audit: ' + this.key + ' => flush() complete => ' + this.records.length + ' lines');
        console.log('audit validation: ' + this.key + ' => validation complete => ' + this.validated_records + ' valid lines');
        this.validated_records = 0;
        delete this.records;
        stop_sql_file();
    }
}

function format_headings(r){
    var s = '';
    if (r){
        s = Object.keys(r[0]).join(' (OLD)\t') + ' (OLD)\t' +
            Object.keys(r[1]).join(' (MATCH)\t') + ' (MATCH)\t' +
            'SQL' + '\n';
    }
    return s;
}

function format_record(r){
    var s = '';
    if (r){
        s = Object.keys(r[0]).map((i) => { return r[0][i] }).join('\t') + '\t' +
            Object.keys(r[1]).map((i) => { return r[1][i] }).join('\t') + '\t' +
            r[2] + '\n';
    }
    return s;
}

function format_sql_record(r){
    var s = '';
    if (r){
        s = r[2].replace("INSERT INTO mdl_log (time,userid,ip,course,module,cmid,action,url,info) VALUES ", "") + "," + '\n';
    }
    return s;
}

function stop_sql_file(){
    fs.readFile('/opt/data/audit_log.sql', function (err,data) {//needed to add a ";"" at the end of the sql commands
        if (err) { return console.log(err);}
        var result = data.slice(0, -2) + ';';   
        fs.writeFile('/opt/data/audit_log.sql', result, { flag: "r+"}, function (err) {
            if (err) { return console.log(err);}
        });
    });
}

function validate_record(r, k, ln){
    var v = false;
    var checks = 0;
    var checks_available = [];
    var passed = 0;
    var checks_passed = [];
    if (r){
        var old_keys = Object.keys(r[0]);
        old_keys.splice(old_keys.indexOf('id'), 1);
        old_keys.splice(old_keys.indexOf('time'), 1);
        old_keys.splice(old_keys.indexOf('userid'), 1);
        old_keys.splice(old_keys.indexOf('ip'), 1);
        old_keys.splice(old_keys.indexOf('course'), 1);
        old_keys.splice(old_keys.indexOf('module'), 1);
        old_keys.splice(old_keys.indexOf('cmid'), 1);
        old_keys.splice(old_keys.indexOf('action'), 1);
        old_keys.splice(old_keys.indexOf('url'), 1);
        old_keys.splice(old_keys.indexOf('info'), 1);
        old_keys.map(function(row) {
            if (
                row.indexOf('email') != -1 ||
                row.indexOf('name') != -1 ||
                row.indexOf('created') != -1 ||
                row.indexOf('title') != -1 ||
                row.indexOf('subject') != -1 || 
                row.indexOf('reference') != -1  
            ) {
                let old_value = r[0][row];
                let match_value = r[1][row];
                checks++;
                checks_available.push(row);
                if (row.indexOf('username') != -1) {
                    let email_str = row.replace('username', 'email');
                    if(old_value == match_value || r[0][email_str] == r[1][email_str]) {
                        checks_passed.push(row);
                        passed++;
                    }
                } else if (row.indexOf('email') != -1) {
                    let username_str = row.replace('email', 'username');
                    if(old_value == match_value || r[0][username_str] == r[1][username_str]) {
                        checks_passed.push(row);
                        passed++;
                    }
                } else if (row.indexOf('role_shortname') != -1) {
                    if(
                        old_value == match_value ||
                        ("msf" + old_value) == match_value ||
                        ("msfsite" + old_value) == match_value ||
                        (old_value == 'instructionaldesigner' || old_value == 'teachereditor') && match_value == 'msfeditingteacher'
                    ) {
                        checks_passed.push(row);
                        passed++;
                    }
                } else {
                    if(old_value == match_value ) {                        
                        checks_passed.push(row);
                        passed++;
                    } else {                        
                        if(typeof old_value == 'string' && old_value.indexOf('lang="es_es"') != -1) {
                            old_value = old_value.replace('lang="es_es"', 'lang="es"');
                        }
                        if(typeof old_value == 'string' && old_value.indexOf('MSF e-Campus') != -1) {
                            old_value = old_value.replace('MSF e-Campus', 'MSF E-Campus');
                        }
                        if(typeof old_value == 'string') {
                            old_value = old_value.replace(/\r/g, "");
                        }
                        if(old_value == match_value ) {                        
                            checks_passed.push(row);
                            passed++;
                        }
                    }
                }
            }            
        });
        v = checks == passed;
        if(!v) {
            console.log('Failed validation: ' + k)
            console.log('Line: ' + ln)
            console.log('checks: ' + checks);
            console.log('passed: ' + passed);
            console.log('failed checks: ' + JSON.stringify(checks_available.filter(x => checks_passed.indexOf(x) < 0 )));
            console.log('row: ' + JSON.stringify(r) );
        }
    }
    return v;
}

var logs = {},
    file = fs.createWriteStream('/opt/data/audit_log.tsv'),
    file_sql = fs.createWriteStream('/opt/data/audit_log.sql');

function audit(table, module, action){

    var key = table + '.' + module + '.' + action;
    if (!logs[key]){
        logs[key] = new logger(key);
    }
    return logs[key];
}

module.exports = audit;

