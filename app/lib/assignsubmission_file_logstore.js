var invalid_users = require('./invalid_users').join(','),
    make_alias = require('./common.js').make_alias,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "created": {
        sql_old: `
            SELECT  log.*,
                    u.username AS pri_username, u.email AS pri_email,
                    r.username AS rel_username, r.email AS rel_email,
                    a.username AS real_username, a.email AS real_email,
                    c.shortname AS course_shortname
            FROM mdl_logstore_standard_log log
            LEFT JOIN mdl_course c ON c.id=log.courseid
            LEFT JOIN mdl_user u ON u.id=log.userid
            LEFT JOIN mdl_user r ON r.id=log.relateduserid
            LEFT JOIN mdl_user a ON a.id=log.realuserid
            WHERE log.objecttable='assignsubmission_file' AND log.action='created'
            AND log.userid NOT IN (${invalid_users})
            AND (log.relateduserid IS NULL OR log.relateduserid NOT IN (${invalid_users}))
            AND (log.realuserid IS NULL OR log.realuserid NOT IN (${invalid_users})) ` ,
        
        sql_old_2pass: (row) => {
            let sql= ` SELECT asi.name AS assign_name
                    FROM mdl_assignsubmission_file af
                    LEFT JOIN mdl_assign asi ON af.assignment = asi.id 
                    WHERE af.id=${row.objectid}`;
            return sql;
        },

        sql_match:  (row) => {
            return mysql.format(
                `SELECT u.username AS pri_username, u.email AS pri_email, u.id as pri_userid,
                        r.username AS rel_username, r.email AS rel_email, r.id as rel_userid,
                        a.username AS real_username, a.email AS real_email, a.id as real_userid,
                        c.id AS course_id,c.shortname as course_shortname,
                        af.id as object_id
                FROM mdl_course c 
                LEFT JOIN mdl_user u ON (u.email='${row.pri_email}' OR u.username='${row.pri_username}')
                LEFT JOIN mdl_user r ON (r.email='${row.rel_email}' OR r.username='${row.rel_username}')
                LEFT JOIN mdl_user a ON (a.email='${row.real_email}' OR a.username='${row.real_username}') ` +
                'JOIN mdl_assign asi ON  asi.course = c.id AND asi.name = ? ' + 
                'JOIN mdl_assign_submission asu ON asu.assignment = asi.id ' + 
                'JOIN mdl_assignsubmission_file af ON af.assignment = asi.id AND af.submission = asu.id ' +
                "WHERE c.shortname = ? ",
                [
                    row["assign_name"],
                    row["course_shortname"]
                ]
            )
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return  (!lr.userid || (lr.pri_username === nm.pri_username || lr.pri_email === nm.pri_email)) &&
                        (!lr.relateduserid || (lr.rel_username === nm.rel_username || lr.rel_email === nm.rel_email)) &&
                        (!lr.realuserid || (lr.real_username === nm.real_username || lr.real_email === nm.real_email));
            });
        },

        fn: function(old_row, match_row, next){
            let output =`
                    INSERT INTO mdl_logstore_standard_log
                        (eventname,component,action,target,objecttable,objectid,crud,
                        edulevel,contextid,contextlevel,contextinstanceid,userid,courseid,
                        relateduserid,anonymous,other,timecreated,origin,ip,realuserid)
                    VALUES (
                        '${old_row.eventname}',
                        '${old_row.component}',
                        '${old_row.action}',
                        '${old_row.target}',
                        '${old_row.objecttable}',
                        ${match_row.object_id || old_row.objectid},
                        '${old_row.crud}',
                        ${old_row.edulevel},
                        ${old_row.contextid},
                        ${old_row.contextlevel},
                        ${old_row.contextinstanceid},
                        ${match_row.pri_userid},
                        ${match_row.course_id},
                        ${match_row.rel_userid},
                        ${old_row.anonymous},
                        '${old_row.other}',
                        ${old_row.timecreated},
                        '${old_row.origin}',
                        '${old_row.ip}',
                        ${match_row.real_userid}
                    )`.replace(/\s+/g, ' ');
            next && next(null, output);
        }
    },
    'updated':{
        alias: () => { make_alias(library, 'updated', 'created') }
    }
};

module.exports =  library;