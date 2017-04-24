var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

/*
mysql> select action,count(*) from mdl_log where module='message' group by action;
+-----------------+----------+
| action          | count(*) |
+-----------------+----------+
| add contact     |     1193 |
| block contact   |       65 |
| history         |     1610 |
| remove contact  |      106 |
| unblock contact |       19 |
| write           |     7637 |
+-----------------+----------+
*/

var library = {
    "add contact": undefined,
    "block contact": undefined,
    "history": undefined,
    "remove contact": undefined,
    "unblock contact": undefined,
    "write": {
        /*
        | userid | course | cmid | url                                           | info |
        +--------+--------+------+-----------------------------------------------+------+
        |      2 |      1 |    0 | history.php?user1=3&user2=2#m2                | 3    |
               ^                                     ^       ^                     ^
               |                                     |       |                     |
               |                                     `-------+--- user B ----------'
               |                                             |
               `------------ user A -------------------------'
        |   3111 |      1 |    0 | index.php?user=3111&id=3105&history=1#m226436 | 3111 |
        |   3105 |      1 |    0 | index.php?user=3105&id=3111&history=1#m226437 | 3105 |
              ^                                     ^       ^                        ^
              |                                     |       |                        |
              |                                     |     user B                     |
              |                                     |                                |
              `-------------- user A ---------------+--------------------------------'
        */
        sql_old:    'SELECT log.*, ' +
                    '       uA.email AS uA_email, uA.username AS uA_username, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user uA ON uA.id = log.userid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'message' AND log.action = 'write' AND " + restrict_clause,

        sql_old_2pass: (row) => {
            let m = row.url.match(/index.php.*id=(\d+)/);
            if (!m && row.url.match(/history.php/)){
                m = [null, row.info];
            }
            return mysql.format(
                'SELECT email AS uB_email, ' +
                '       username AS uB_username ' +
                'FROM mdl_user ' +
                'WHERE id = ?',
                [
                    m[1]
                ]
            );
        },

        sql_match: (row) => {
            if (row.uA_email && row.uB_email){
                return mysql.format(
                    'SELECT uA.id AS uA_id, uA.email AS uA_email, uA.username AS uA_username, ' +
                    '       uB.id AS uB_id, uB.email AS uB_email, uB.username AS uB_username ' +
                    'FROM mdl_user uA, ' +
                    '     mdl_user uB ' +
                    'WHERE uA.email = ? AND uB.email = ?',
                    [
                        row.uA_email,
                        row.uB_email
                    ]
                );
            }else{
                return mysql.format(
                    'SELECT uA.id AS uA_id, uA.email AS uA_email, uA.username AS uA_username, ' +
                    '       uB.id AS uB_id, uB.email AS uB_email, uB.username AS uB_username ' +
                    'FROM mdl_user uA, ' +
                    '     mdl_user uB ' +
                    'WHERE uA.username = ? AND uB.username = ?',
                    [
                        row.uA_username,
                        row.uB_username
                    ]
                );
            }
        },

        format: {
            'no_matches': (row) => {
                return 'No match for users A=' + row.uA_username + ', B=' + row.uB_username;
            }
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                .replace(/\?user=\d+/, '?user=' + match_row.uA_id)
                                .replace(/\?id=\d+/, '?id=' + match_row.uB_id)
                                .replace(/\?user1=\d+/, '?user1=' + match_row.uB_id)
                                .replace(/\?user2=\d+/, '?user2=' + match_row.uA_id)
                                ;
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
                                "'" + (old_row.url.match(/index.php/) ?
                                                match_row.uA_id :
                                                match_row.uB_id) + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
};

module.exports = library;

