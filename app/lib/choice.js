var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*

        +--------+--------+------+------------------+------+
        | userid | course | cmid | url              | info |
        +--------+--------+------+------------------+------+
        | 1418   | 110    | 7641 | view.php?id=7641 | 16   |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=mdl_course_modules.id 
        info --> mdl_choice.id & mdl_course_modules.instance 
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       ch.name AS choice_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_choice ch ON ch.id = cm.instance AND ch.course = c.id AND ch.id = log.info ' +
                    "WHERE log.module = 'choice' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       ch.id AS choiceid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_choice ch ON ch.course = c.id AND BINARY ch.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = ch.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'choice') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["choice_name"],
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
                                "'" + match_row.choiceid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "choose": {
        alias: () => { make_alias(library, 'choose', 'add') }
    },
    "update": {
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "view": {
        alias: () => { make_alias(library, 'view', 'add') }
    },
    "view all": { 
        /*
        +--------+--------+------+-----------------+------+
        | userid | course | cmid | url             | info |
        +--------+--------+------+-----------------+------+
        | 449    | 60     | 0    | index.php?id=60 |      |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> 0
        url --> index.php?id=mdl_course.id 
        info --> empty
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'choice' AND log.action = 'view all' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'WHERE c.shortname = ? ',
                [
                    row["username"],
                    row["email"],
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
            var updated_url = old_row.url.replace(/id=\d+/, 'id=' + match_row.course);
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
}

module.exports = library;


