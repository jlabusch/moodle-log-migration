var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
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
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '", ' +
                        'post="' + row.post_subject + '"' +
                        'user="' + row.username + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
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
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'forum="' + row.forum_name + '", ' +
                        'discussion="' + row.discussion_name + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
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

        format: {
            'no_matches': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'discussion="' + row.discussion_name + '"'
            },
            'multiple_matches': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'discussion="' + row.discussion_name + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
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
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '", ' +
                        'forum="' + row.forum_name + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
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
                return  'No unique matches for course="' + row.course_shortname + '", ' +
                        'user="' + row.username + '"'
            },
            'multiple_matches_unresolved': (row) => {
                return  'No unique matches for course="' + row.course_shortname + '", ' +
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


