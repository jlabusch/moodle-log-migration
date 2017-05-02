var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*

        +--------+--------+-------+-------------------+------+
        | userid | course | cmid  | url               | info |
        +--------+--------+-------+-------------------+------+
        | 355    | 110    | 13233 | view.php?id=13233 | 1    |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=mdl_course_modules.id 
        info --> mdl_lti.id & mdl_course_modules.instance 
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       l.name AS lti_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm ON cm.id = log.cmid ' +
                    'JOIN mdl_lti l ON l.id = cm.instance AND l.course = c.id AND l.id = log.info ' +
                    "WHERE log.module = 'lti' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, cm.instance AS module_instance, ' +
                '       l.id AS ltiid, l.name AS lti_name ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_lti l ON l.course = c.id AND BINARY l.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = l.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'lti') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["lti_name"],
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
                                "'" + match_row.ltiid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "launch": {
        /*
        +--------+--------+------+-------------------+------+
        | userid | course | cmid | url               | info |
        +--------+--------+------+-------------------+------+
        | 355    | 110    | 0    | view.php?id=13233 | 1    |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=mdl_course_modules.id 
        info --> mdl_lti.id & mdl_course_modules.instance 
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       l.name AS lti_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_lti l ON l.course = c.id AND l.id = log.info ' +
                    'JOIN mdl_course_modules cm ON cm.instance = l.id AND  cm.course = c.id AND cm.id = SUBSTRING(log.url FROM LOCATE("id=", log.url) + 3) ' +
                    "WHERE log.module = 'lti' AND log.action = 'launch' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, cm.instance AS module_instance, ' +
                '       l.id AS ltiid, l.name AS lti_name  ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_lti l ON l.course = c.id AND BINARY l.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = l.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'lti') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["lti_name"],
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
                                "'" + match_row.ltiid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "update": {
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "view": {
        alias: () => { make_alias(library, 'view', 'launch') }
    }
}

module.exports = library;


