var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": {
        alias: () => {
            library['add'].sql_old = library['login'].sql_old.replace(/login/, 'add');
        },

        sql_match: (row, shadow) => {
            if (shadow){
                // We have the new user's email+username
                return mysql.format(
                    'SELECT c.id AS course, ' +
                    '       admin.id AS admin_id, ' +
                    '       admin.username AS admin_username, ' +
                    '       user.id AS user_id, ' +
                    '       user.username AS user_username ' +
                    'FROM mdl_course c ' +
                    'JOIN mdl_user admin on BINARY admin.email = ? ' +
                    'JOIN mdl_user user on BINARY user.email = ? ' +
                    'WHERE c.shortname = ?',
                    [
                        row["email"],
                        shadow[0]["user_email"],
                        row["course_shortname"]
                    ]
                );
            }else{
                // Look up the new user based on ID
                var new_user = row.url.match(/id=(\d+)/);
                if (!new_user){
                    throw new Error("Can't determine new user ID from action URL " + row.url);
                }
                return mysql.format(
                    'SELECT c.id AS course, ' +
                    '       admin.id AS admin_id, ' +
                    '       admin.username AS admin_username, ' +
                    '       user.email AS user_email, ' +
                    '       user.username AS user_username ' +
                    'FROM mdl_course c ' +
                    'JOIN mdl_user admin on BINARY admin.email = ? ' +
                    'JOIN mdl_user user on user.id = ? ' +
                    'WHERE c.shortname = ?',
                    [
                        row["email"],
                        new_user[1],
                        row["course_shortname"]
                    ]
                );
            }
        },

        fixer: undefined, // difficult problem, small impact

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(new RegExp('id=' + old_row.userid), 'id=' + match_row.user_id)
                                .replace(/course=\d+/, 'course=' + match_row.course);
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.admin_id,
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
    "login": {
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'user' AND log.action = 'login' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS userid, ' +
                '       u.username ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON BINARY u.email = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["email"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => { return lr.username === nm.username });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(new RegExp('id=' + old_row.userid), 'id=' + match_row.userid)
                                .replace(/course=\d+/, 'course=' + match_row.course);
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
                                "'" + match_row.userid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "change password": {
        alias: () => { make_alias(library, 'change password', 'login')() }
    },
    "logout": {
        alias: () => { make_alias(library, 'logout', 'login')() }
    },
    "view": {
        /*
        | userid | course | url                         | info |
        +--------+--------+-----------------------------+------+
        |   3137 |    274 | view.php?id=3139&course=274 | 3139 |
              |                          |                  |
              |                          `------------------+- user 2
              `- user 1
        */
        sql_old:    'SELECT log.*, ' +
                    '       u1.email AS u1_email, u1.username AS u1_username, ' +
                    '       u2.email AS u2_email, u2.username AS u2_username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u1 ON u1.id = log.userid ' +
                    'JOIN mdl_user u2 ON u2.id = log.info ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'user' AND log.action = 'view' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u1.id AS u1_userid, u1.username AS u1_username, ' +
                '       u2.id AS u2_userid, u2.username AS u2_username ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u1 ON BINARY u1.email = ? ' +
                'JOIN mdl_user u2 ON BINARY u2.email = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["u1_email"],
                    row["u2_email"],
                    row["course_shortname"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.u1_username === nm.u1_username &&
                       lr.u2_username === nm.u2_username
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/id=\d+/, 'id=' + match_row.u2_userid)
                                .replace(/course=\d+/, 'course=' + match_row.course);
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.u1_userid,
                                "'" + old_row.ip + "'",
                                match_row.course,
                                "'" + old_row.module + "'",
                                old_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + match_row.u2_userid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view all": {
        alias: () => { make_alias(library, 'view all', 'login')() },

        /*
        | userid | course | cmid | action   | url            | info |
        +--------+--------+------+----------+----------------+------+
        |      2 |      1 |    0 | view all | index.php?id=1 |      |
                                              or view.php?id=<something>&course=<course>
        */
        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/index.php.*/, 'index.php?id=' + match_row.course)
                                // not enough data to translate view.php's id param
                                .replace(/course=\d+/, 'course=' + match_row.course);
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
    "delete": {
        alias: () => { make_alias(library, 'delete', 'login')() },

        /*
        | userid | course | cmid | url              | info                            |
        +--------+--------+------+------------------+---------------------------------+
        |   1578 |      1 |    0 | view.php?id=1443 | Juan Antonio Ayerbe             |
        */
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
    "update": {
        alias: () => { make_alias(library, 'update', 'login')() },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(new RegExp('id=' + old_row.userid), 'id=' + match_row.userid)
                                .replace(/course=\d+/, 'course=' + match_row.course);
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

