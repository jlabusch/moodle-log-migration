var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
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

        fixer: function(log_row, old_matches, new_matches){
            // Yes we're passing new_matches in twice, because of the
            // weird hack in sql_match() to do a second lookup in the
            // old (shadow) matches for user_username/user_email
            return fix_by_shadow_index(log_row, new_matches, new_matches, (lr, om) => { return lr.username === om.user_username });
        },

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
            return fix_by_shadow_index(log_row, old_matches, new_matches, (lr, om) => { return lr.username === om.username });
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

