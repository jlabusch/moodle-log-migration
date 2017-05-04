var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        //The data structure has 'label_id' in the 'info' column. (same as chat module -> add action)
        sql_old:    'SELECT log.*, ' +
                '       u.username, u.email, ' +
                '       l.name AS label_name, l.timemodified, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                'JOIN mdl_label l on l.id = log.info AND l.id = cm.instance ' +
                "WHERE log.module = 'label' AND log.action = 'add' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       l.id AS label_id, l.name AS label_name, ' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'JOIN mdl_label l ON (l.name = ?  OR l.timemodified = ?) AND l.course = c.id ' + 
                'JOIN mdl_course_modules cm ON cm.course = c.id AND cm.module = ' +
                    "   (SELECT id from mdl_modules where name = 'label') " +
                'WHERE c.shortname = ? ',
                [
                    row["username"],
                    row["email"],
                    row["label_name"],
                    row["timemodified"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.cmid);

            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                match_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + match_row.label_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "update":{
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "view all":{
        //No cmid, no info.(same as 'chat' module -> 'view all' action)
        sql_old:    'SELECT log.*, ' +
            '       u.username, u.email, ' +
            '       c.shortname AS course_shortname ' +
            'FROM mdl_log log ' +
            'JOIN mdl_user u on u.id = log.userid ' +
            'JOIN mdl_course c ON c.id = log.course ' +
            "WHERE log.module = 'label' AND log.action = 'view all' AND " + restrict_clause,
    
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?id=\d+/, '?id=' + match_row.course);

            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                old_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }        
    }
};

module.exports = library;
