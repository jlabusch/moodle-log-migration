var restrict_clause = require('./sql_restrictions.js')(),
    fix_by_match_index = require('./common.js').fix_by_match_index,
    make_alias = require('./common.js').make_alias,
    mysql = require('mysql');

var library = {
    "add contact": {        
        /*
        +--------+--------+------+-------------------------------------+-------+
        | userid | course | cmid | url                                 | info  |
        +--------+--------+------+-------------------------------------+-------+
        | 1174   | 1      | 0    | discussion.php?user1=491&user2=1174 |  491  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname) --- always 1
        cmid --> always 0
        url --> index.php?user1=1004&user2=1206  [542 rows]
        url --> index.php?user1=1004&user2=1206  [649 rows]
        url --> discussion.php?user1=491&user2=1174  [2 rows]
        info --> 491 -> receiver id
        */
        sql_old:    'SELECT log.*, ' +
                    '       (log.url like "%index%") AS with_index, ' + 
                    '       u.username AS sender_username, u.email AS sender_email, ' +
                    '       u2.username AS receiver_username, u2.email AS receiver_email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_user u2 ON u2.id = log.info ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'message' AND log.action = 'add contact' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS senderid, u.username AS sender_username, u.email AS sender_email, ' +
                '       u2.id AS receiverid, u2.username AS receiver_username, u2.email AS receiver_email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_user u2 ON (u2.username = ? OR u2.email = ?) ' +
                'WHERE c.shortname = ?',
                [
                    row["sender_username"],
                    row["sender_email"],
                    row["receiver_username"],
                    row["receiver_email"],
                    row["course_shortname"]
                ]
            );            
            
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.sender_username === nm.sender_username || lr.sender_email === nm.sender_email) &&
                       (lr.receiver_username === nm.receiver_username || lr.receiver_email === nm.receiver_email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url, updated_info;
            updated_url = old_row.url
                .replace(/user1=\d+/, 'user1=' + match_row.receiverid)
                .replace(/user2=\d+/, 'user2=' + match_row.senderid);
            updated_info = match_row.receiverid; 
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
                                "'" + updated_info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "block contact": { 
        alias: () => { make_alias(library, 'block contact', 'add contact') }
    },
    "history": { 
        alias: () => { make_alias(library, 'history', 'add contact') }
    },
    "remove contact": { 
        alias: () => { make_alias(library, 'remove contact', 'add contact') }
    },
    "unblock contact": { 
        alias: () => { make_alias(library, 'unblock contact', 'add contact') }
    },
    "write": {
        /*
        +--------+--------+------+------------------------------------------+-------+
        | userid | course | cmid | url                                      | info  |
        +--------+--------+------+------------------------------------------+-------+
        | 530    | 1      | 0    | index.php?user=530&id=73&history=1#m7203 |  530  |

        userid --> mdl_user.id
        course --> mdl_course.id (unique shortname) --- always 1
        cmid --> always 0
        case 1:  --- [3319 rows, user -> sender id (matches log.userid), id -> receiver id, #m7203 -> message id, history=1 always] 
            url --> index.php?user=530&id=73&history=1#m7203 
            info --> 530 -> sender id (matches log.userid)
        case 2: --- [4318 rows, user1 -> receiver id, user2 -> sender id (matches log.userid), #m2 -> message id]
            url --> history.php?user1=3&user2=2#m2  
            info --> 3 -> receiver id
        */
        sql_old:    'SELECT log.*, ' +
                    '       (log.url like "%index%") AS with_index, ' + 
                    '       u.username AS sender_username, u.email AS sender_email, ' +
                    '       u2.username AS receiver_username, u2.email AS receiver_email, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u ON u.id = log.userid ' +
                    'JOIN mdl_user u2 ON u2.id = ' +
                    '(' +
                    'CASE WHEN LOCATE("index", log.url) > 0 ' +
                    'THEN REPLACE(SUBSTRING(log.url FROM LOCATE("id=", log.url) + 3), SUBSTRING(log.url FROM LOCATE("&history=", log.url)), "") ' +
                    'ELSE REPLACE(SUBSTRING(log.url FROM LOCATE("user1=", log.url) + 6), SUBSTRING(log.url FROM LOCATE("&user2", log.url)), "") ' +
                    'END' +
                    ') ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'message' AND log.action = 'write' AND " + restrict_clause,

        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       u.id AS senderid, u.username AS sender_username, u.email AS sender_email, ' +
                '       u2.id AS receiverid, u2.username AS receiver_username, u2.email AS receiver_email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                'JOIN mdl_user u2 ON (u2.username = ? OR u2.email = ?) ' +
                'WHERE c.shortname = ?',
                [
                    row["sender_username"],
                    row["sender_email"],
                    row["receiver_username"],
                    row["receiver_email"],
                    // row["timecreated"],
                    row["course_shortname"]
                ]
            );            
            
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.sender_username === nm.sender_username || lr.sender_email === nm.sender_email) &&
                       (lr.receiver_username === nm.receiver_username || lr.receiver_email === nm.receiver_email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url, updated_info;
            if(old_row.with_index == false) {
                updated_url = old_row.url
                    .replace(/user1=\d+/, 'user1=' + match_row.receiverid)
                    .replace(/user2=\d+/, 'user2=' + match_row.senderid);
                updated_info = match_row.receiverid;
            } else {
                updated_url = old_row.url
                    .replace(/user=\d+/, 'user=' + match_row.senderid)
                    .replace(/id=\d+/, 'id=' + match_row.receiverid);                
                updated_info = match_row.senderid;
            }
            updated_url = updated_url + '#message_id_not_migrated';
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
                                "'" + updated_info + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    }
};

module.exports = library;

