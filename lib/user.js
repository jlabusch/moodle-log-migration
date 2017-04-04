var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    mysql = require('mysql');

var library = {
    "login": {
        sql_old:    "SELECT log.*, u.email, u.username " +
                    "FROM mdl_log log " +
                    "JOIN mdl_user u on u.id=log.userid " +
                    "WHERE log.module = 'user' AND log.action = 'login' AND " + restrict_clause,

        sql_match: (row) => {
            return mysql.format(
                'SELECT u.id AS userid, u.username FROM mdl_user u WHERE u.email = ?',
                [
                    row["email"],
                    row["username"]
                ]
            );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_shadow_index(log_row, old_matches, new_matches, (lr, om) => { return lr.username === om.username });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(new RegExp('id=' + old_row.userid), 'id=' + match_row.user)
            var output ='INSERT INTO mdl_log ' +
                        '(time,userid,ip,course,module,cmid,action,url,info) VALUES ' +
                        '(' +
                            [
                                old_row.time,
                                match_row.userid,
                                "'" + old_row.ip + "'",
                                old_row.course,
                                "'" + old_row.module + "'",
                                old_row.cmid,
                                "'" + old_row.action + "'",
                                "'" + updated_url + "'",
                                "'" + match_row.userid + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
};

module.exports = library;

