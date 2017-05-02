var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*

        +--------+--------+------+-----------------------------+-------------------+
        | userid | course | cmid | url                         | info              |
        +--------+--------+------+-----------------------------+-------------------+
        |      6 |      1 |    0 | index.php?userid=6&postid=6 |  Nueva entrada 1  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url --> index.php?userid=6&postid=1 / index.php?userid=943&entryid=93 (both 'postid' and 'entryid' refer to mdl_post.id)
        info --> mdl_post.subject 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       p.subject ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_post p ON p.id = SUBSTRING(log.url FROM (CASE WHEN LOCATE("&postid",log.url) > 0 THEN (LOCATE("&postid",log.url) + 8) ELSE (LOCATE("&entryid",log.url) + 9) END) ) AND p.subject = log.info AND p.module LIKE "blog%" AND p.userid = log.userid ' + 
                    "WHERE log.module = 'blog' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname,  ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       p.id AS postid, p.subject ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                "LEFT JOIN mdl_post p ON p.subject = ? AND p.module = 'blog' AND p.userid = u.id " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["email"],
                    row["subject"],
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
            var updated_url = old_row.url.replace(/userid=\d+/, 'userid=' + match_row.userid);
            var info;
            if (match_row.postid != null) {
                updated_url.replace(/postid=\d+/, 'postid=' + match_row.postid)
                           .replace(/entryid=\d+/, 'entryid=' + match_row.postid)
            }
            if (match_row.subject != null) {
                info = match_row.subject;
            } else {
                info = old_row.info;
            }
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
                                "'" + info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "delete": { 
        
        /*

        +--------+--------+------+--------------------+---------------------------------------+
        | userid | course | cmid | url                | info                                  |
        +--------+--------+------+--------------------+---------------------------------------+
        |      2 |      1 |    0 | index.php?userid=2 |  deleted blog entry with entry id# 1  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url --> index.php?userid=2
        info --> 'deleted blog entry with entry id# 1'

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, u.email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'blog' AND log.action = 'delete' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname,  ' +
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'WHERE c.shortname = ?',
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
            var updated_url = old_row.url.replace(/userid=\d+/, 'userid=' + match_row.userid);
            var updated_info = old_row.info.replace(/id#/, '(old)id#');
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
                                "'" + updated_info + "'"
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
        +--------+--------+------+--------------+-------------------+
        | userid | course | cmid | url          | info              |
        +--------+--------+------+--------------+-------------------+
        |      6 |      1 |    0 | [see  below] |  view blog entry |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url -->  index.php?filtertype=user&filterselect=2&postid=0&tagid=0&tag=  [1614 rows]  -- filterselect = mdl_user.id --- tagid always 0
        url -->  index.php?filtertype=course&filterselect=18&postid=0&tagid=0&tag=  [304 rows] -- filterselect = mdl_course.id --- tadgid <> 0  six times
        url -->  index.php?filtertype=site&filterselect=0&postid=0&tagid=0&tag=  [75 rows] -- filterselect always 0 --- tagid <> 0 once
        url -->  index.php?filtertype=group&filterselect=110&postid=0&tagid=0&tag=  [12 rows]  -- filterselect = mdl_groups.id --- tagid always 0
        url -->  index.php?entryid=&tagid=&tag=  [1579 rows]
        url -->  index.php?entryid=104&tagid=&tag=  [15 rows]
        info --> 'view blog entry'
        */
        sql_old:    'SELECT log.*, (CASE WHEN LOCATE("filtertype", log.url) > 0 THEN REPLACE(SUBSTRING(log.url FROM LOCATE("filtertype", log.url)+ 11), SUBSTRING(log.url FROM LOCATE("filterselect", log.url) - 1), "") END) as type, ' +
                    '       u.username, u.email, ' +
                    '       u2.username AS target_username, u2.email AS target_email, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       g.name AS group_name, g.timecreated AS group_created, ' +
                    '       t.name AS tag_name, ' +
                    '       p.subject, p.created as post_created ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'LEFT JOIN mdl_user u2 ON u2.id = (CASE WHEN (LOCATE("filtertype",log.url) > 0 AND REPLACE(SUBSTRING(log.url FROM LOCATE("filtertype",log.url)+ 11 ) , SUBSTRING(log.url FROM LOCATE("filterselect",log.url) - 1 ) , "") = "user")  THEN REPLACE(SUBSTRING(log.url FROM LOCATE("filterselect",log.url)+ 13 ) , SUBSTRING(log.url FROM LOCATE("postid",log.url) - 1 ) , "" ) END ) ' +
                    'LEFT JOIN mdl_groups g ON g.id = (CASE WHEN (LOCATE("filtertype",log.url) > 0 AND REPLACE(SUBSTRING(log.url FROM LOCATE("filtertype",log.url)+ 11 ) , SUBSTRING(log.url FROM LOCATE("filterselect",log.url) - 1 ) , "") = "group")  THEN REPLACE(SUBSTRING(log.url FROM LOCATE("filterselect",log.url)+ 13 ) , SUBSTRING(log.url FROM LOCATE("postid",log.url) - 1 ) , "" ) END ) ' +
                    'LEFT JOIN mdl_tag t ON t.id = REPLACE(SUBSTRING(log.url FROM LOCATE("tagid", log.url)+ 6), SUBSTRING(log.url FROM LOCATE("tag=", log.url) - 1), "")' +
                    'LEFT JOIN mdl_post p ON p.id = (CASE WHEN LOCATE("filtertype", log.url) > 0 THEN REPLACE(SUBSTRING(log.url FROM LOCATE("postid", log.url)+ 7), SUBSTRING(log.url FROM LOCATE("tagid", log.url) - 1), "") ELSE REPLACE(SUBSTRING(log.url FROM LOCATE("entryid", log.url) + 8), SUBSTRING(log.url FROM LOCATE("tagid", log.url) - 1), "") END) AND p.module LIKE "blog%" AND p.userid = log.userid ' + 
                    "WHERE log.module = 'blog' AND log.action = 'view' AND " + restrict_clause,

        sql_match:  (row) => {
            if (row['type'] == 'group') {
                return mysql.format(
                    'SELECT c.id AS course, c.shortname AS course_shortname,  ' +
                    '       u.id AS userid, u.username, u.email, ' +
                    '       g.id AS groupid, g.name AS group_name, g.timecreated AS group_created  ' +
                    'FROM mdl_course c ' +
                    'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                    'JOIN mdl_groups g ON BINARY g.name = ? AND  g.timecreated = ? ' +
                    'WHERE c.shortname = ? ',
                    [
                        row["username"],
                        row["email"],
                        row["group_name"],
                        row["group_created"],
                        row["course_shortname"]
                    ]
                );
            } else if (row['type'] == 'user') {                
                return mysql.format(
                    'SELECT c.id AS course, c.shortname AS course_shortname,  ' +
                    '       u.id AS userid, u.username, u.email, ' +
                    '       u2.id AS targetid, u2.username AS target_username, u2.email AS target_email, ' +
                    'FROM mdl_course c ' +
                    'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                    'LEFT JOIN mdl_user u2 ON (u2.username = ? OR u2.email = ? ) ' +
                    'WHERE c.shortname = ? ',
                    [
                        row["username"],
                        row["email"],
                        row["target_username"],
                        row["target_email"],
                        row["course_shortname"]
                    ]
                );
            } else {                
                if (row['tag_name'] != null) {                
                    return mysql.format(
                        'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                        '       u.id AS userid, u.username, u.email, ' +
                        '       t.id AS tagid, t.name AS tag_name,  ' +
                        'FROM mdl_course c ' +
                        'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                        'LEFT JOIN mdl_tag t ON t.name = ? ' +
                        'WHERE c.shortname = ? ',
                        [
                            row["username"],
                            row["email"],
                            row["tag_name"],
                            row["course_shortname"]
                        ]
                    );
                } else if(row['subject'] != null) {
                    return mysql.format(
                        'SELECT c.id AS course, c.shortname AS course_shortname, ' +
                        '       u.id AS userid, u.username, u.email, ' +
                        '       p.id AS postid, p.subject, p.created as post_created ' +
                        'FROM mdl_course c ' +
                        'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                        'JOIN mdl_post p ON p.subject = ?  AND p.created = ? ' +
                        'WHERE c.shortname = ? ',
                        [
                            row["username"],
                            row["email"],
                            row["subject"],
                            row["post_created"],
                            row["course_shortname"]
                        ]
                    );
                } else {
                    return mysql.format(
                        'SELECT c.id AS course, c.shortname AS course_shortname, ' +
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
                }
            }
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url;
            if (old_row.type == 'group') {
                updated_url = old_row.url.replace(/filterselect=\d+/, 'filterselect=' + match_row.groupid);
            } else if (old_row.type == 'user') { 
                updated_url = old_row.url.replace(/filterselect=\d+/, 'filterselect=' + match_row.targetid);
            } else {                
                if (old_row.tag_name != null) { 
                    updated_url = old_row.url.replace(/tagid=\d+/, 'tagid=' + match_row.tagid);
                } else if(old_row.subject != null) {
                    updated_url = old_row.url.replace(/postid=\d+/, 'postid=' + match_row.tagid)
                                             .replace(/entryid=\d+/, 'entryid=' + match_row.tagid);
                } else {
                    updated_url = old_row.url
                }
            }
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


