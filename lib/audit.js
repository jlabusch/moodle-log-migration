var fs = require('fs');

function logger(key){
    this.key = key;
    this.records = [];
    this.needs_header = true;
}

logger.prototype.append = function(row, match, result){
    //console.log(this.key + ' => append(' + result + ')');
    this.records.push([row, match, result]);
}

logger.prototype.flush = function(i){
    //console.log('audit: ' + this.key + ' => flush(i:' + i + ')');
    if (process.env.DISABLE_AUDIT){
        return;
    }
    var ok = true;
    i = i || 0;
    if (this.needs_header){
        ok = file.write(
            this.key + '\n' +
            format_headings(this.records[0])
        );
        this.needs_header = false;
    }
    while (ok && i < this.records.length){
        ok = file.write(format_record(this.records[i]));
        if (process.env.LOSSY_AUDIT){
            i += i;
        }
        i++;
    }
    if (i < this.records.length){
        file.once('drain', () => { this.flush(i) });
    }else{
        console.log('audit: ' + this.key + ' => flush() complete => ' + this.records.length + ' lines');
        delete this.records;
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

var logs = {},
    file = fs.createWriteStream('/opt/data/audit_log.tsv');

function audit(table, module, action){
    var key = table + '.' + module + '.' + action;
    if (!logs[key]){
        logs[key] = new logger(key);
    }
    return logs[key];
}

module.exports = audit;

