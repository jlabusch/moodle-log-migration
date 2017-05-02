var restrict_clause = require('./sql_restrictions.js')(),
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*

        +--------+--------+-------+-------------------+------+
        | userid | course | cmid  | url               | info |
        +--------+--------+-------+-------------------+------+
        | 187    | 204    | 15853 | view.php?id=15853 |  1  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=mdl_course_modules.id 
        info --> mdl_data.id & mdl_course_modules.instance 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       x.name AS data_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_data x ON x.id = cm.instance and x.course = log.course ' +
                    "WHERE log.module = 'data' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, cm.instance AS module_instance, ' +
                '       x.id AS dataid, x.name AS data_name ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_data x ON x.course = c.id AND BINARY x.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = x.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'data') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["data_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.cmid);
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
                                "'" + match_row.dataid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "fields add": { 
        /*

        +--------+--------+-------+----------------------------------+------+
        | userid | course | cmid  | url                              | info |
        +--------+--------+-------+----------------------------------+------+
        | 187    | 204    | 15853 | field.php?d=1&mode=display&fid=0 | 0    |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> field.php?d=1&mode=display&fid=0 -- id refers to mdl_data.id
        info --> 0
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       x.name AS data_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_data x ON x.id = cm.instance AND x.course = c.id AND x.id = REPLACE(SUBSTRING(log.url FROM LOCATE("d=", log.url)+ 2), SUBSTRING(log.url FROM LOCATE("&mode", log.url)), "") ' +
                    "WHERE log.module = 'data' AND log.action = 'fields add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, cm.instance AS module_instance, ' +
                '       x.id AS dataid, x.name AS data_name ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_data x ON x.course = c.id AND BINARY x.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = x.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'data') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["data_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?id=\d+/, '\?id=' + match_row.datatid);
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
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
}

module.exports = library;


