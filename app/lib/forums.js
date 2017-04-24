var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        /*

        +--------+--------+------+-----------------+------+
        | userid | course | cmid | url             | info |
        +--------+--------+------+-----------------+------+
        |     48 |     18 |  317 | view.php?id=317 |  68  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?id=mdl_course_modules.id 
        info --> mdl_forum.id & mdl_course_modules.instance 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'add' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid, ' +
                '       f.id AS forumid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["forum_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.cmid);
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
                                "'" + match_row.forumid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "add discussion": {
        /*

        +--------+--------+------+-------------------+------+
        | userid | course | cmid | url               | info |
        +--------+------+-----------------+----------+------+
        |     48 |     18 |  317 | discuss.php?d=282 | 282  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> discuss.php?d=mdl_forum_discussions.id 
        info --> mdl_forum_discussions.id

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username,' +
                    '       c.shortname AS course_shortname, ' +
                    '       d.id AS discussion_id, d.name AS discussion_name, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course ' +
                    'JOIN mdl_forum_discussions d ON d.id = log.info ' +
                    "WHERE log.module = 'forum' AND log.action = 'add discussion' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname, ' +
                '       cm.id AS cmid, ' +
                '       d.id AS did ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'JOIN mdl_forum_discussions d ON d.course = c.id AND BINARY d.name = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["forum_name"],
                    row["discussion_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/d=\d+/, 'd=' + match_row.did)
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
                                "'" + match_row.did + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "mail blocked": {
        /*

        +---------+--------+------+-----+------+
        |  userid | course | cmid | url | info |
        +---------+--------+------+-----+------+
        |     218 |     1  |  0   |     |      |

        userid --> mdl_user.id
        ip -> empty
        course --> always 1 (matches course 'MSF e-Campus')
        cmid --> always 0
        url --> empty
        info --> empty

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'mail blocked' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
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
                                "'" + old_row.url + "'",
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "mail digest error": {
        /*

        +---------+--------+---------+-----+------+
        |  userid | course |   cmid  | url | info |
        +---------+--------+---------+-----+------+
        |    904  |    97  |  6065   |     |      |

        userid --> mdl_user.id
        ip -> '0.0.0.0'
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> empty
        info --> empty

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course  ' +
                    "WHERE log.module = 'forum' AND log.action = 'mail digest error' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username as uname, ' +
                '       cm.id AS cmid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["forum_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
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
                                "'" + old_row.url + "'",
                                "'" + old_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "mail error": {
        /*

        +---------+--------+---------+---------------------------+----------------------+
        |  userid | course |  cmid  |  url                       |                 info |
        +---------+--------+--------+----------------------------+----------------------+
        |    57  |    32   |  580   |  discuss.php?d=533#p1453   |   La señora Salmon   |

        userid --> mdl_user.id
        ip -> empty
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> discuss.php?d=533#p1453
                               |    |___= mdl_forum_posts.id (created, subject)
                               |________= mdl_forum_discussions.id
        info --> 'La señora Salmon'  mdl_forum_posts.subject

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       p.subject AS post_subject, ' +
                    '       d.id AS discussion_id, d.name as discussion_name, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course  ' +
                    'JOIN mdl_forum_posts p ON p.id = SUBSTRING(log.url FROM LOCATE("#p",log.url) + 2) ' +
                    'JOIN mdl_forum_discussions d ON d.id = p.discussion ' +
                    "WHERE log.module = 'forum' AND log.action = 'mail error' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname, ' +
                '       cm.id AS cmid, ' +
                '       d.id as did, ' +
                '       p.id AS postid, p.subject AS postsubject ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ? ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'JOIN mdl_forum_discussions d ON d.course = c.id AND d.forum = f.id AND BINARY d.name = ? ' +
                'JOIN mdl_forum_posts p ON p.subject = ? AND p.discussion = d.id '+
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["forum_name"],
                    row["discussion_name"],
                    row["post_subject"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/d=\d+/, 'd=' + match_row.did)
                                .replace(/#p\d+/, '#p' + match_row.postid);
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
                                "'" + match_row.postsubject + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "mark read": {
        /*

        +---------+--------+---------+-----------------+---------+
        |  userid | course |  cmid  |  url             |    info |
        +---------+--------+--------+------------------+---------+
        |    98  |    32   |  628   |  view.php?f=132  |   132   |

        userid --> mdl_user.id
        ip -> empty
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> view.php?f=132
                            |___= mdl_forum.id
        info --> mdl_forum.id

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course and f.id = log.info ' +
                    "WHERE log.module = 'forum' AND log.action = 'mark read' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname, ' +
                '       cm.id AS cmid, ' +
                '       f.id as forumid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ? ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["forum_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/f=\d+/, 'f=' + match_row.forumid);
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
                                "'" + match_row.forumid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "move discussion": {
        alias: () => { make_alias(library, 'move discussion', 'add discussion') }
    },
    "prune post": {
        /*

        +---------+--------+--------+----------------------+----------+
        |  userid | course |  cmid  |  url                 |     info |
        +---------+--------+--------+----------------------+----------+
        |    2   |    32   |  628   |  discuss.php?d=465   |   1172   |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> discuss.php?d=465
                               |________= mdl_forum_discussions.id
        info --> mdl_forum_posts.id (created, subject)

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       p.created AS post_created, p.subject AS post_subject, p.id as post_id, ' +
                    '       d.id AS discussion_id, d.name as discussion_name, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum_posts p ON p.id = log.info ' +
                    'JOIN mdl_forum_discussions d ON d.id = p.discussion ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course  ' +
                    "WHERE log.module = 'forum' AND log.action = 'prune post' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname, ' +
                '       cm.id AS cmid, ' +
                '       d.id as did, ' +
                '       p.id AS postid, p.subject AS postsubject ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'JOIN mdl_forum_discussions d ON d.course = c.id AND BINARY d.name = ? ' +
                'JOIN mdl_forum_posts p ON  p.created = ? AND p.subject = ? AND p.discussion = d.id '+
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["forum_name"],
                    row["discussion_name"],
                    row["post_created"],
                    row["post_subject"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/d=\d+/, 'd=' + match_row.did);
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
                                "'" + match_row.postid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "search": {
        /*

        +---------+--------+------+----------------------------------+------------+
        |  userid | course | cmid |                              url |       info |
        +---------+--------+------+----------------------------------+------------+
        |     204 |    20  |  0   |  search.php?id=20&search=doubts  |   doubts   |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url --> search.php?id=20&search=doubts
                            |           |___= search term used
                            |_______________= mdl_course.id
        info --> 'doubts' - the search term

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'search' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.course);
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
    "start tracking": {
        alias: () => { make_alias(library, 'start tracking', 'mark read') }
    },
    "stop tracking": {
        alias: () => { make_alias(library, 'stop tracking', 'mark read') }
    },
    "subscribe": {
        alias: () => { make_alias(library, 'subscribe', 'mark read') }
    },
    "subscribeall": {    
        /*

        +--------+--------+------+-----------------+------+
        | userid | course | cmid | url             | info |
        +--------+--------+------+-----------------+------+
        |    412 |     42 |   0  | index.php?id=42 |  42  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url --> index.php?id=42 -- mdl_course.id (unique shortname)
        info --> mdl_course.id (unique shortname)

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'subscribeall' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ?  ' +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.course);
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
                                "'" + match_row.course + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "unsubscribe": {
        alias: () => { make_alias(library, 'unsubscribe', 'mark read') }
    },
    "unsubscribeall": {
        alias: () => { make_alias(library, 'unsubscribeall', 'subscribeall') }
    },
    "user report": {
        /*

        +---------+--------+--------+--------------------------------------+-------+
        |  userid | course |  cmid  |  url                                 |  info |
        +---------+--------+--------+--------------------------------------+-------+
        |    2   |    1    |    0   |  user.php?course=1&id=2&mode=posts   |   2   |

        userid --> author mdl_user.id
        course --> mdl_course.id (unique shortname)
        cmid --> always 0
        url --> user.php?course=1&id=2&mode=posts
                                |    |        |____ = mode (either posts or discussions)
                                |    |_____________ = target mdl_user.id                
                                |__________________ = mdl_course.id (unique shortname)
        info --> target mdl_user.id 

        */
        sql_old:    'SELECT log.*, ' +
                    '       u1.username AS author_username, u2.username AS target_username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u1 ON u1.id = log.userid ' +
                    'JOIN mdl_user u2 ON u2.id = log.info ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'user report' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u1.id AS author_userid, u1.username AS auname, ' +
                '       u2.id AS target_userid, u2.username AS tguname ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u1 ON u1.username = ?  ' +
                'JOIN mdl_user u2 ON u2.username = ?  ' +
                'WHERE c.shortname = ?',
                [
                    row["author_username"],
                    row["target_username"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){        
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.author_username === nm.auname) && (lr.target_username === nm.tguname);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/course=\d+/, 'course=' + match_row.course)
                                .replace(/id=\d+/, 'id=' + match_row.target_userid);
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
                                "'" + match_row.target_userid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view subscribers": {
        /*

        +---------+--------+---------+-----------------------+--------+
        |  userid | course |  cmid  |  url                   |   info |
        +---------+--------+--------+------------------------+--------+
        |    48  |    18   |  317   |  subscribers.php?id=68 |   68   |

        userid --> mdl_user.id
        ip -> empty
        course --> mdl_course.id (unique shortname)
        cmid --> mdl_course_modules.id (unique course,module,instance)
        url --> subscribers.php?id=68
                                   |___= mdl_forum.id
        info --> mdl_forum.id

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course and f.id = log.info ' +
                    "WHERE log.module = 'forum' AND log.action = 'view subscribers' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username AS uname, ' +
                '       cm.id AS cmid, ' +
                '       f.id as forumid ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.username = ? ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'WHERE c.shortname = ?',
                [
                    row["username"],
                    row["forum_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.uname;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.forumid);
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
                                "'" + match_row.forumid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },

    "add post": {
        /*
        +--------+------+------------------------------+------+
        | course | cmid | url                          | info |
        +--------+------+------------------------------+------+
        |     18 |  336 | discuss.php?d=306&parent=705 | 705  |
              |      |        |    |                      |
              |      |        |    `----------------------+- mdl_forum_posts.id (unique userid,created,subject)
              |      |        |
              |      |        `- 306 -> mdl_forum_posts.discussion == mdl_forum_discussions.id (unique course,forum,name)
              |      |
              |      `- 336 -> mdl_course_modules.id (unique course,module,instance)
              `- mdl_course.id (unique shortname)

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       cm.instance AS module_instance, ' +
                    '       p.created AS post_created, p.subject AS post_subject, ' +
                    '       d.id AS discussion_id, d.name as discussion_name, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum_posts p ON p.id = log.info AND p.userid = log.userid ' +
                    'JOIN mdl_forum_discussions d ON d.id = p.discussion AND d.course = log.course AND d.forum = cm.instance ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'add post' AND " + restrict_clause,

        sql_match:  (row) => {
            // Note: main reason for missed matches is duplicate user accounts, where the old
            // one (whose ID would match here) has had their username+email renamed.
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       d.id as did, d.name as discussion_name, ' +
                '       p.id AS postid, p.subject as post_subject, p.created AS post_created ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.email = ? ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id ' +
                'JOIN mdl_forum_discussions d ON d.course = c.id AND d.forum = f.id AND BINARY d.name = ? ' +
                'JOIN mdl_forum_posts p ON p.userid = u.id AND p.created = ? AND p.subject = ? AND p.discussion = d.id '+
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["forum_name"],
                    row["discussion_name"],
                    row["post_created"],
                    row["post_subject"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            // There are surprisingly many double-posts. (Hundreds)
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.created === nm.created;
            });
        },

        format: {
            'no_matches': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '", ' +
                        'post="' + row.post_subject + '"' +
                        'user="' + row.username + '"'
            },
            'multiple_matches': (row) => {
                return  'Multiple matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '", ' +
                        'post="' + row.post_subject + '"' +
                        'user="' + row.username + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'Ambiguous matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '", ' +
                        'post="' + row.post_subject + '"' +
                        'user="' + row.username + '"'
            }
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/d=\d+/, 'd=' + match_row.did)
                                .replace(/parent=\d+/, 'parent=' + match_row.postid);
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
                                "'" + match_row.postid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "update post": {
        alias: () => { make_alias(library, 'update post', 'add post') }
    },
    "delete post": {
        /*
        +--------+------+-------------+-------------------+------+
        | course | cmid | action      | url               | info |
        +--------+------+-------------+-------------------+------+
        |     18 |  303 | delete post | discuss.php?d=247 | 747  |
              |      |                                 |     |
              |      |                                 |     `- (deleted post, gone from DB)
              |      |                                 |
              |      |                                 `- 247 -> mdl_forum_posts.discussion == 
              |      |                                           mdl_forum_discussions.id (unique course,forum,name)
              |      |
              |      `- 303 -> mdl_course_modules.id (unique course,module,instance)
              `- mdl_course.id (unique shortname)
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       cm.instance AS module_instance, ' +
                    '       d.id AS discussion_id, d.name as discussion_name, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum_discussions d ON ' +
                    "       d.id = (SELECT REPLACE(log.url, 'discuss.php?d=', '')) AND " + // moodle is pretty shit eh wot
                    '       d.course = log.course AND ' +
                    '       d.forum = cm.instance ' +
                    'JOIN mdl_forum f ON f.id = cm.instance and f.course = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'delete post' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, ' +
                '       cm.id AS cmid, ' +
                '       d.id as did ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.email = ? ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'JOIN mdl_forum_discussions d ON d.course = c.id AND d.forum = f.id AND BINARY d.name = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["forum_name"],
                    row["discussion_name"],
                    row["course_shortname"]
                ]
            );
        },

        format: {
            'no_matches': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '"'
            },
            'multiple_matches': (row) => {
                return  'Multiple matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'Ambiguous matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '"'
            }
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/d=\d+/, 'd=' + match_row.did);
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
                                "'" + /* nothing sane to add */ "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "delete discussion": {
        /*
        | userid | course | cmid | url               | info |
        +--------+--------+------+-------------------+------+
        |     31 |     18 |  307 | discuss.php?d=307 | 65   |
                              |                         |
                              |                         `- mdl_forum.id (not discussion ID as with view)
                              `- mdl_course_modules.id (unique course+instance)
                                  `-> instance === mdl_forum.id === mdl_forum_discussion.forum
        */

        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       cm.instance AS module_instance, ' +
                    '       f.id AS forum_id, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum f on f.id = cm.instance ' +
                    "WHERE log.module = 'forum' AND log.action = 'delete discussion' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, ' +
                '       cm.id AS cmid, ' +
                '       f.id AS forum ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.email = ? ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["forum_name"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
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
                                "'" + match_row.forum + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view discussion": {
        /*
        | userid | course | cmid | url               | info |
        +--------+--------+------+-------------------+------+
        |     48 |     18 |  317 | discuss.php?d=284 | 284  |
                              |                         |
                              |                         `- mdl_forum_discussions.id
                              |                            (unique course+forum+name)
                              `- mdl_course_modules.id (unique course+instance)
                                  `- instance === mdl_forum.id -> mdl_forum_discussion.forum
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       cm.instance AS module_instance, ' +
                    '       d.name AS discussion_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_course_modules cm on cm.id = log.cmid ' +
                    'JOIN mdl_forum_discussions d on d.id = log.info ' +
                    "WHERE log.module = 'forum' AND log.action = 'view discussion' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, u.email, ' +
                '       cm.id AS cmid, ' +
                '       d.id as did, d.name as discussion_name, d.forum as discussion_forum ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.email = ? ' +
                'JOIN mdl_forum_discussions d ON d.course = c.id AND BINARY d.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = d.forum AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["discussion_name"],
                    row["course_shortname"]
                ]
            );
        },

        match_failed_because_of_known_bad_data: (row) => {
            return row.username === 'alaguna' && row.course_shortname.match(/MSFSECUMNGMT/) ||
                   row.course_shortname.match(/_testVersionEPIC/);
        },

        format: {
            'no_matches': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'discussion="' + row.discussion_name + '"'
            },
            'multiple_matches': (row) => {
                return  'Multiple matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'discussion="' + row.discussion_name + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'Ambiguous matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'discussion="' + row.discussion_name + '"'
            }
        },


        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/d=\d+/, 'd=' + match_row.did);
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
                                "'" + match_row.did + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "update": {
        alias: () => { make_alias(library, "update", "view forum") }
    },
    "view forum": {
        /*
        | userid | course | cmid | action     | url             | info |
        +--------+--------+------+------------+-----------------+------+
        |    352 |     30 |  571 | view forum | view.php?id=571 | 119  |
             |         |      |                                    |
             |         |      |                                    `- mdl_course_modules.instance ==
             |         |      |                                       mdl_forum.id (unique course+name)
             |         |      |
             |         |      `- mdl_course_modules.id (unique course+instance)
             |         |
             |         `- match shortname
             |
             `- match email
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname, ' +
                    '       f.name AS forum_name ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    'JOIN mdl_forum f ON f.id = log.info and f.course = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'view forum' AND " + restrict_clause,

        sql_match: (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username, ' +
                '       cm.id AS cmid, ' +
                '       f.name as forum_name, ' +
                '       cm.instance AS info ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.email = ? ' +
                'JOIN mdl_forum f ON f.course = c.id AND BINARY f.name = ? ' +
                'JOIN mdl_course_modules cm ON cm.instance = f.id AND cm.course = c.id and cm.module = ' +
                "   (SELECT id from mdl_modules where name = 'forum') " +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["forum_name"],
                    row["course_shortname"]
                ]
            );
        },

        format: {
            'no_matches': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'forum="' + row.forum_name + '"'
            },
            'multiple_matches': (row) => {
                return  'Multiple matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'forum="' + row.forum_name + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'Ambiguous matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'forum="' + row.forum_name + '"'
            }
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
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
                                "'" + match_row.info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    'view forums': {
        /*
        | userid | course | module | cmid | action      | url             | info |
        +--------+--------+--------+------+-------------+-----------------+------+
        |    352 |     44 | forum  |    0 | view forums | index.php?id=44 |      |
        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'forum' AND log.action = 'view forums' AND " + restrict_clause,

        sql_match: (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, u.username ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON u.email = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        format: {
            'no_matches': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '"'
            },
            'multiple_matches': (row) => {
                return  'Multiple matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'Ambiguous matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '"'
            }
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
                                0,
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


