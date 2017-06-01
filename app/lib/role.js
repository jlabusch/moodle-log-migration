/*

Roles have been heavily changed

| Old Name               | Old Shortname         | New Shortname       |
+------------------------+-----------------------+---------------------+
| Manager                | manager               | msfsitemanager      | -- assumed msfsitemanager, there is also a msflearningmanager
+------------------------+-----------------------+---------------------+
| Instructional Designer | instructionaldesigner | msfeditingteacher   |
+------------------------+-----------------------+---------------------+
| Subject Matter Expert  | subjectmatterexpert   | subjectmatterexpert | -- not changed
+------------------------+-----------------------+---------------------+
| Tutor                  | tutor                 | msftutor            |
+------------------------+-----------------------+---------------------+
| Student                | student               | msfstudent          |
+------------------------+-----------------------+---------------------+
| Guest                  | guest                 | msfguest            |
+------------------------+-----------------------+---------------------+
| Authenticated user     | user                  | msfuser             |
+------------------------+-----------------------+---------------------+
| Teacher                | teachereditor         | msfeditingteacher   |
+------------------------+-----------------------+---------------------+
| Observer               | obs                   | obs                 | -- not changed
+------------------------+-----------------------+---------------------+
| LockProfile            | lockprofile           |                     | -- not existing
+------------------------+-----------------------+---------------------+

*/
var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql'),
    dbs = require('./dbs.js');

var library = {
    "assign": { 
        /*
        | userid | course |  cmid | url                                          | info     |
        +--------+--------+-------+----------------------------------------------+----------+
        |   178  |     1  |    0  | admin/roles/assign.php?contextid=1&roleid=3  | Teacher  |
        |   179  |     1  |    0  | admin/roles/assign.php?contextid=1&roleid=5  | Student  |
             |         |       |                              |               |        |
        mdl_user.id    |       |                              |               |        |
                mdl_course.id  |                              |               |      mdl_role.name (does't always match)
                      mdl_course_modules.id                   |               |
                                            mdl_role_assignments.contextid    |
                                                                            mdl_role.id
        */
        sql_old:    'SELECT log.*, ' +
                '       u.username, u.email, ' +
                '       r.shortname AS role_shortname, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_role r ON r.id = SUBSTRING(log.url, (LOCATE("&roleid=",log.url) + 8)) ' +
                'JOIN mdl_context cx ON cx.id = REPLACE(SUBSTRING(log.url, (LOCATE("?contextid=",log.url) + 11)) , SUBSTRING(log.url, (LOCATE("&roleid=",log.url))), "") '+
                "WHERE log.module = 'role' AND log.action = 'assign' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname,' +
                '       r.id AS role_id, r.name AS role_name, r.shortname AS role_shortname, ' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cx.id AS context_id ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                "LEFT JOIN mdl_role r ON r.shortname like ?  " +
                "JOIN mdl_context cx ON cx.instanceid = c.id AND cx.contextlevel = '50' " +
                "WHERE c.shortname = ? ",
                [
                    row["username"],
                    row["email"],
                    (row["role_shortname"] == 'instructionaldesigner' || row["role_shortname"] == 'teachereditor') ? 'msfeditingteacher' : "%" + row["role_shortname"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url.replace(/\?contextid=\d+/, '?contextid=' + match_row.context_id);
            var updated_info = old_row.info;
            if(match_row.role_id != null) {
                updated_url = updated_url.replace(/\&roleid=\d+/, '&roleid=' + match_row.role_id);
                updated_info = match_row.role_name;
            } else {
                updated_url = updated_url + "#role_id_not_migrated";
            }
            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
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
                                info
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "unassign": {
        alias: () => { make_alias(library, 'unassign', 'assign') }
    },
    "override": {
        alias: () => { make_alias(library, 'override', 'assign') }
    },
    "edit": {
        // Similar to the assign action except there's no context.id in the url
        sql_old:    'SELECT log.*, ' +
                '       u.username, u.email, ' +
                '       r.shortname AS role_shortname, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_role r ON r.id = SUBSTRING(log.url, (LOCATE("&roleid=",log.url) + 8)) ' +
                "WHERE log.module = 'role' AND log.action = 'edit' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname,' +
                '       r.id AS role_id, r.name AS role_name, r.shortname AS role_shortname, ' + 
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                "LEFT JOIN mdl_role r ON r.shortname like ? " +
                "WHERE c.shortname = ? ",
                [
                    row["username"],
                    row["email"],
                    (row["role_shortname"] == 'instructionaldesigner' || row["role_shortname"] == 'teachereditor') ? 'msfeditingteacher' : "%" + row["role_shortname"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url;
            var updated_info = old_row.info;
            if(match_row.role_id != null) {
                updated_url = updated_url.replace(/\&roleid=\d+/, '&roleid=' + match_row.role_id);
                updated_info = match_row.role_name;
            } else {
                updated_url = updated_url + "#role_id_not_migrated";
            }
            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
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
                                info
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "duplicate": {
        alias: () => { make_alias(library, 'duplicate', 'edit') }
    },
    "delete": {
        alias: () => { make_alias(library, 'delete', 'edit') }
    },
    "reset": {
        alias: () => { make_alias(library, 'reset', 'edit') }
    },
    "add": {
        // 6 mdl_log rows, no cm.id, no context.id, no role.id but role.name in the info column 
        sql_old:    'SELECT log.*, ' +
        '       u.username, u.email, ' +
        '       r.shortname AS role_shortname, ' +
        '       c.shortname AS course_shortname ' +
        'FROM mdl_log log ' +
        'JOIN mdl_user u on u.id = log.userid ' +
        'JOIN mdl_course c ON c.id = log.course ' +
        'LEFT JOIN mdl_role r ON r.name = log.info ' +
        "WHERE log.module = 'role' AND log.action = 'add' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, c.shortname AS course_shortname,' +
                '       r.id AS role_id, r.name AS role_name, r.shortname AS role_shortname, ' + 
                '       u.id AS userid, u.username, u.email ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ?) ' +
                "LEFT JOIN mdl_role r ON r.shortname like ? " +
                "WHERE c.shortname = ? ",
                [
                    row["username"],
                    row["email"],
                    (row["role_shortname"] == 'instructionaldesigner' || row["role_shortname"] == 'teachereditor') ? 'msfeditingteacher' : "%" + row["role_shortname"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_info = match_row.role_id == null ? old_row.info : match_row.role_name;
            let info = `?`;
            info = dbs.mysql_to_postgres(mysql.format(info, [updated_info]));
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
                                info
                            ].join(',') +
                        ')';

            next && next(null, output);
        }
    },
    "edit allow override": {
        // 1 mdl_log row, no cm.id, no context.id, no role.id, no role.name
        alias: () => { make_alias(library, 'edit allow override', 'add') }
    },
    "edit allow assign": {
        // 2 mdl_log rows, no cm.id, no context.id, no role.id, no role.name
        alias: () => { make_alias(library, 'edit allow assign', 'add') }        
    },
    "edit allow switch": {
        // 4 mdl_log rows, no cm.id, no context.id, no role.id, no role.name
        alias: () => { make_alias(library, 'edit allow switch', 'add') }
    },
};

module.exports = library;
