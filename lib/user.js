var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var ghost_users = {},
    ambiguous_users = {};

function filter_users(obj){
    return Object.keys(obj)
                    .filter((x) => { return obj[x] > 10 })
                    .map((x) => { return '' + x + ': ' + obj[x] });
}

function maybe_print(label, obj){
    let arr = filter_users(obj);
    if (arr.length){
        console.log(label + ': ' + JSON.stringify(arr, null, 2));
    }
}

var library = {
    "add": {
        sql_old:    'SELECT log.*, ' +
                    '       u1.email as admin_email, u1.username as admin_username, ' +
                    '       u2.email as user_email, u2.username as user_username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u1 ON u1.id = log.userid ' +
                    "JOIN mdl_user u2 ON u2.id = (select REPLACE((select REPLACE(log.url, 'view.php?id=', '')), '&course=1', '')) " +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'user' AND log.action = 'add' AND " + restrict_clause,

        // FIXME: this gets called impossibly for quiz/attempt
        sql_match: (row) => {
            if (row.module !== 'user' || row.action !== 'add'){
                throw new Error("Invalid use of user.add sql_match: " + JSON.stringify(row));
            }
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       a.id AS admin_id, ' +
                '       a.username AS admin_username, ' +
                '       u.id AS user_id, ' +
                '       u.username AS user_username ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user a on BINARY a.email = ? ' +
                'JOIN mdl_user u on BINARY u.email = ? ' +
                'WHERE c.shortname = ?',
                [
                    row["admin_email"],
                    row["user_email"],
                    row["course_shortname"]
                ]
            );
        },

        format: {
            'multiple_matches': (row) => {
                ambiguous_users[row.user_id] = ambiguous_users[row.user_id] || 0;
                ambiguous_users[row.user_id]++;
                maybe_print('ambiguous users', ambiguous_users);
                return "No unique match for \n" +
                       "\tid=" + row.admin_id + ", email='" + row.admin_email + "', username='" + row.admin_username + "'\n" +
                       "\tid=" + row.user_userid + ", email='" + row.user_email + "', username='" + row.user_username + "'";
            },
            'no_matches': (row) => {
                ghost_users[row.user_id] = ghost_users[row.user_id] || 0;
                ghost_users[row.user_id]++;
                maybe_print('ghost users', ghost_users);
                return "No matches for \n" +
                       "\tid=" + row.admin_userid + ", email='" + row.admin_email + "', username='" + row.admin_username + "'" +
                       "\tid=" + row.user_id + ", email='" + row.user_email + "', username='" + row.user_username + "'";
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
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username
            });
        },

        format: {
            'multiple_matches': (row) => {
                ambiguous_users[row.userid] = ambiguous_users[row.userid] || 0;
                ambiguous_users[row.userid]++;
                maybe_print('ambiguous users', ambiguous_users);
                return "No unique match for id=" + row.userid + ", email='" + row.email + "', username='" + row.username + "'";
            },
            'no_matches': (row) => {
                ghost_users[row.userid] = ghost_users[row.userid] || 0;
                ghost_users[row.userid]++;
                maybe_print('ghost users', ghost_users);
                return "No matches for id=" + row.userid + ", email='" + row.email + "', username='" + row.username + "'";
            }
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
        alias: () => { make_alias(library, 'change password', 'login') }
    },
    "logout": {
        alias: () => { make_alias(library, 'logout', 'login') }
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

        format: {
            'multiple_matches': (row) => {
                ambiguous_users[row.info] = ambiguous_users[row.info] || 0;
                ambiguous_users[row.info]++;
                maybe_print('ambiguous users', ambiguous_users);
                return "No unique match for \n" +
                       "\tid=" + row.userid + ", email='" + row.u1_email + "', username='" + row.u1_username + "'\n" +
                       "\tid=" + row.info + ", email='" + row.u2_email + "', username='" + row.u2_username + "'";
            },
            'no_matches': (row) => {
                ghost_users[row.info] = ghost_users[row.info] || 0;
                ghost_users[row.info]++;
                maybe_print('ghost users', ghost_users);
                return "No matches for \n" +
                       "\tid=" + row.userid + ", email='" + row.u1_email + "', username='" + row.u1_username + "'\n" +
                       "\tid=" + row.info + ", email='" + row.u2_email + "', username='" + row.u2_username + "'";
            }
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
        alias: () => { make_alias(library, 'view all', 'login') },

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
        alias: () => { make_alias(library, 'delete', 'login') },

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
        alias: () => { make_alias(library, 'update', 'login') },

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

