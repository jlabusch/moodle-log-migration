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
                    '       u.username AS author_username, u.email AS author_email, ' +
                    '       u1.username AS target_username, u1.email AS target_email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       p.id AS post_id, p.content, p.userid AS post_userid ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u on u.id = log.userid ' +
                    'JOIN mdl_user u1 on u1.id = REPLACE(SUBSTRING(log.url, (LOCATE("&user=",log.url) + 6)), SUBSTRING(log.url, LOCATE("#note-",log.url)), "") ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_post p ON p.id = SUBSTRING(log.url, (LOCATE("#note-",log.url) + 6)) AND p.courseid = c.id AND p.module = "notes" ' + 
                    "WHERE log.module = 'notes' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u1.id AS author_userid, u1.username AS author_username, u1.email AS author_email, ' +
                '       u2.id AS target_userid, u2.username AS target_username, u2.email AS target_email, ' +
                '       p.id AS post_id ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u1 ON (u1.username = ? OR u1.email = ?) ' +
                'JOIN mdl_user u2 ON (u2.username = ? OR u2.email = ?)  ' +
                "LEFT JOIN mdl_post p ON p.content = ? AND p.module = 'notes' " +
                'WHERE c.shortname = ?',
                [
                    row["author_username"],
                    row["author_email"],
                    row["target_username"],
                    row["target_email"],
                    row["content"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){        
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.author_username === nm.author_username || lr.author_email === nm.author_email) &&
                       (lr.target_username === nm.target_username || lr.target_email === nm.target_email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                    .replace(/\?course=\d+/, '?course=' + match_row.course)
                                    .replace(/&user=\d+/, '&user=' + match_row.target_userid);
            if(match_row.post_id != null) {
                updated_url = updated_url.replace(/#note-\d+/, '#note-' + match_row.post_id);
            } else {
                updated_url = updated_url + "#notes_id_not_migrated";
            }
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.author_userid,
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
        /*
        +--------+--------+------+---------------------------+-----------+
        | userid | course | cmid | url                       | info      |
        +--------+--------+------+---------------------------+-----------+
        | 2      | 1      | 0    | index.php?course=1&user=2 | view note |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url -->  index.php?course=1&user=2  [267 rows] 
        url -->  index.php?course=18&user=0  [105 rows] 
        info --> 'view note'
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username AS author_username, u.email AS author_email, ' +
                    '       u1.username AS target_username, u1.email AS target_email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u on u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'LEFT JOIN mdl_user u1 on u1.id = SUBSTRING(log.url, (LOCATE("&user=",log.url) + 6)) ' +
                    "WHERE log.module = 'notes' AND log.action = 'view' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                '       u1.id AS author_userid, u1.username AS author_username, u1.email AS author_email, ' +
                '       u2.id AS target_userid, u2.username AS target_username, u2.email AS target_email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u1 ON (u1.username = ? OR u1.email = ?) ' +
                'LEFT JOIN mdl_user u2 ON (u2.username = ? OR u2.email = ?)  ' +
                'WHERE c.shortname = ? ',
                [
                    row["author_username"],
                    row["author_email"],
                    row["target_username"],
                    row["target_email"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){        
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.author_username === nm.author_username || lr.author_email === nm.author_email) &&
                       (lr.target_username === nm.target_username || lr.target_email === nm.target_email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?course=\d+/, '?course=' + match_row.course);
            if(match_row.target_userid != null) {
                updated_url = updated_url.replace(/&user=\d+/, '&user=' + match_row.target_userid);
            } else {
                if(match_row.target_userid != 0) {
                    updated_url = updated_url + "#user_id_not_migrated";
                }
            }
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.author_userid,
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
