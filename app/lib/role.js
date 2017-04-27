var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
	"add": {	
        // 6 mdl_log rows, no cmid, info containd the mdl_role.name that does't always match   **AND cx.contextlevel = 50 
	},
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
                '       r.name AS role_name, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_role r ON r.id = SUBSTRING(log.url, (LOCATE("&roleid=",log.url) + 8),1) ' +
                'JOIN `mdl_context` cx ON cx.id = SUBSTRING(log.url, (LOCATE("?contextid=",log.url) + 11),4) ' +
                'JOIN `mdl_role_assignments` ra ON ra.contextid = SUBSTRING(log.url, (LOCATE("?contextid=",log.url) + 11),4) AND ra.roleid= r.id AND ra.timemodified = log.time ' +
                "WHERE log.module = 'role' AND log.action = 'assign' AND " + restrict_clause,
        
        sql_match:  (row) => {
            return mysql.format(
                'SELECT c.id AS course, ' +
                '       r.id AS role_id, r.name AS role_name, ' + 
                '       u.id AS userid, u.username, u.email, ' +
                '       cx.id AS context_id ' +
                'FROM mdl_course c ' +
                'JOIN mdl_user u ON (u.username = ? OR u.email = ? ) ' +
                'JOIN mdl_context cx ON cx.instanceid = c.id ' +
                'JOIN mdl_role_assignments ra ON ra.contextid = cx.id ' +
                'JOIN mdl_role r ON r.id = ra.roleid ' +
                "WHERE c.shortname = ? AND r.name = ? ",
                [
                    row["username"],
                    row["email"],
                    row["course_shortname"],
                    row["role_name"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return (lr.username === nm.username || lr.email === nm.email);
            });
        },

        fn: function(old_row, match_row, next){
            var updated_url = old_row.url
                                    .replace(/\?contextid=\d+/, '?contextid=' + match_row.context_id)
                                    .replace(/\&roleid=\d+/, '&roleid=' + match_row.role_id);

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
                                "'" + match_row.role_name + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "unassign": {

    },
    "edit": {

    },
    "edit allow assign": {

    },
    "edit allow override": {

    },
    "edit allow switch": {

    },
    "override": {

    },
    "duplicate": {

    },
    "delete": {

    },
	"reset": {

    },
};

module.exports = library;
