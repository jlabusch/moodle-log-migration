var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {    
        /*
        +--------+--------+------+-------------------------------------+-------------------+
        | userid | course | cmid | url                                 | info              |
        +--------+--------+------+-------------------------------------+-------------------+
        |    2   |     30 |    0 | index.php?course=30&user=156#note-6 |  add note         |
             |         |       |                    |                |             
        mdl_user.id    |       |                    |                |             
                mdl_course.id  |                    |                |
                      mdl_course_modules.id         |                |
                      					mdl_course.id	             |   
                                                                     |   
                                                                mdl_post.id
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       p.content, p.id AS post_id, p.subject, p.userid AS post_userid ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_post p ON p.id = SUBSTRING(log.url, (LOCATE("#note-",log.url) + 6),4) AND p.courseid = SUBSTRING(log.url, (LOCATE("?course=",log.url) + 8),4) ' + 
                    "WHERE log.module = 'notes' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course_id, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       p.id AS post_id, p.subject, p.userid AS post_userid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                "LEFT JOIN mdl_post p ON p.content = ? AND p.module = 'notes' " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["content"],
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
            var updated_url = old_row.url
                                    .replace(/\?course=\d+/, '?course=' + match_row.course_id)
                                    .replace(/&user=\d+/, '&user=' + match_row.post_userid)
                                    .replace(/#note-\d+/, '#note-' + match_row.post_id);

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
    },
    "update": {    
        alias: () => { make_alias(library, 'update', 'add') }
    },
    "view": {    
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       p.content ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_post p ON p.courseid = SUBSTRING(log.url, (LOCATE("?course=",log.url) + 8),4) AND p.userid = SUBSTRING(log.url, (LOCATE("&user=",log.url) + 6),5) ' + 
                    "WHERE log.module = 'notes' AND log.action = 'view' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course_id, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       p.id AS post_id, p.subject, p.userid AS post_userid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                "LEFT JOIN mdl_post p ON p.content = ? AND p.module = 'notes' " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["content"],
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
            var updated_url = old_row.url
                                    .replace(/\?course=\d+/, '?course=' + match_row.course_id)
                                    .replace(/&user=\d+/, '&user=' + match_row.post_userid);

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
    },
}

module.exports = library;
