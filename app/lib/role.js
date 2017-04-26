var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
	"add": {	
        // 6 reults, no cmid, no 'Developer' in the mdl_role table
	},
    "assign": {
        //no cmid, url contains role.id
        sql_old:    'SELECT log.*, ' +
                '       u.username, u.email, ' +
                '       r.name AS role_name, ' +
                '       c.shortname AS course_shortname ' +
                'FROM mdl_log log ' +
                'JOIN mdl_user u on u.id = log.userid ' +
                'JOIN mdl_course c ON c.id = log.course ' +
                'JOIN mdl_role r ON r.id = SUBSTRING(log.url, (LOCATE("&roleid=",log.url) + 8),1) ' +
                "WHERE log.module = 'wiki' AND log.action = 'add' AND " + restrict_clause,
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
