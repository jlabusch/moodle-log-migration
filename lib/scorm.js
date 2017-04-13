var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

var library = {
    "add": undefined,
    "delete attempts": undefined,
    "launch": undefined,
    "pre-view": undefined,
    "report": undefined,
    "update": undefined,
    "userreport": undefined,
    "view": {
        /*
        This case has to do two-pass matching to extract the scoid from the url and
        then query mdl_scorm_scoers:

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |      2 |     18 |   315 | player.php?id=315&scoid=26      | 13   |
        |   3118 |    274 | 24161 | player.php?cm=24161&scoid=9879  | 2216 |
             |         |       |                               |        |
        mdl_user.id    |       |                               |        |
                mdl_course.id  |                               |        |
                      mdl_course_modules.id                    |        |
                                                    mdl_scorm_scoes.id  |
                                                                    mdl_scorm.id

        This case doesn't need pass 2, but needs different matching:

        | userid | course |  cmid | url                             | info |
        +--------+--------+-------+---------------------------------+------+
        |   1808 |    274 | 24161 | player.php?cm=24161&scoid=      | 2216 | (Broken, can't fix)

        ========
         PASS 1
        ========

        select course,cmid,url from mdl_log where module='scorm' and action='view' and id=2157709;
        +--------+-------+--------------------------------+
        | course | cmid  | url                            |
        +--------+-------+--------------------------------+
        |    274 | 24161 | player.php?cm=24161&scoid=9879 |
        +--------+-------+--------------------------------+

        select course,instance from mdl_course_modules where id=24161;
        +--------+----------+
        | course | instance |
        +--------+----------+
        |    274 |     2216 |
        +--------+----------+

        select shortname from mdl_course where id=274;
        +----------------------+
        | shortname            |
        +----------------------+
        | PPD_FirstQuarter2015 |
        +----------------------+

        select course,name,reference from mdl_scorm where id=2216;
        +--------+-----------------------------+-------------------+
        | course | name                        | reference         |
        +--------+-----------------------------+-------------------+
        |    274 | The Phases of Project Cycle | Project Cycle.zip |
        +--------+-----------------------------+-------------------+

        ========
         PASS 2
        ========

        select scorm,identifier,title from mdl_scorm_scoes where id=9879;
        +-------+----------------------------------+------------------------------+
        | scorm | identifier                       | title                        |
        +-------+----------------------------------+------------------------------+
        |  2216 | The_Phases_of_Project_Cycle__SCO | The Phases of Project Cycle  |
        +-------+----------------------------------+------------------------------+

        ============================
         REVERSE MATCH (with scoid)
        ============================

        select  c.shortname, o.id as sco_id, o.scorm as sco_scorm, o.identifier as
                sco_ident, s.name as scorm_name, s.reference as scorm_ref, s.course
                as scorm_course from mdl_scorm_scoes o join mdl_scorm s on s.id=o.scorm
                join mdl_course c on c.id=s.course where o.title='The Phases of
                Project Cycle' and o.identifier='The_Phases_of_Project_Cycle__SCO'
                and c.shortname='PPD_FirstQuarter2015';

        +----------------------+--------+-----------+----------------------------------+...
        | shortname            | sco_id | sco_scorm | sco_ident                        |...
        +----------------------+--------+-----------+----------------------------------+...
        | PPD_FirstQuarter2015 |   9879 |      2216 | The_Phases_of_Project_Cycle__SCO |...

                                    ...+-----------------------------+-------------------+--------------+
                                    ...| scorm_name                  | scorm_ref         | scorm_course |
                                    ...+-----------------------------+-------------------+--------------+
                                    ...| The Phases of Project Cycle | Project Cycle.zip |          274 |

        */
        sql_old:    'SELECT log.*, ' +
                    '       u.email, u.username, ' +
                    '       s.name AS scorm_name, s.reference AS scorm_reference, ' +
                    '       c.shortname AS course_shortname ' +
                    'FROM mdl_log log ' +
                    'JOIN mdl_user u on u.id = log.userid ' +
                    'JOIN mdl_scorm s on s.id = log.cmid ' +
                    'JOIN mdl_course c ON c.id = log.course ' +
                    "WHERE log.module = 'scorm' AND log.action = 'view' AND " + restrict_clause,

        sql_old_2pass : (row) => {
            // We need this because MySQL doesn't give us a way to pattern-match the
            // scoid out of the URL in the sql_old query itself.
            var m = row.url.match(/scoid=(\d+)/);
            if (!m){
                console.log('No scoid in URL ' + JSON.stringify(row));
                return null;
            }
            return  mysql.format(
                'SELECT o.identifier AS sco_identifier, ' +
                '       o.title AS sco_title ' +
                'FROM mdl_scorm_scoes o ' +
                'WHERE o.id = ? ',
                [
                    m[1]
                ]
            );
        },

        format: {
            'no_matches_p2': (row) => {
                return "no sco row matches '" + row.url + "' in old dataset";
            }
        },

        sql_match:  (row) => {
            return row.sco_title ?
                    mysql.format(
                        'SELECT c.id AS course, ' +
                        '       o.id AS sco_id, o.title AS sco_title, o.identifier AS sco_identifier, ' +
                        '       s.id AS scorm_id, ' + 
                        '       u.id AS userid, u.username ' +
                        'FROM mdl_scorm_scoes o ' +
                        'JOIN mdl_scorm s ON s.id = o.scorm ' +
                        'JOIN mdl_course c ON c.id=s.course ' +
                        'JOIN mdl_user u ON BINARY u.email = ? ' +
                        'WHERE o.title = ? AND o.identifier=? AND c.shortname = ?',
                        [
                            row["email"],
                            row["sco_title"],
                            row["sco_identifier"],
                            row["course_shortname"]
                        ]
                    )
                    :
                    mysql.format(
                        'SELECT c.id AS course, ' +
                        '       s.id AS scorm_id, ' +
                        '       u.id AS userid, u.username ' +
                        'FROM mdl_course c ' +
                        'JOIN mdl_scorm s ON s.name = ? and s.course=c.id ' +
                        'JOIN mdl_user u ON BINARY u.email = ? ' +
                        'WHERE c.shortname = ?',
                        [
                            row["scorm_name"],
                            row["email"],
                            row["course_shortname"]
                        ]
                    );
        },

        fixer: function(log_row, old_matches, new_matches){
            return fix_by_match_index(log_row, old_matches, new_matches, (lr, nm) => {
                return lr.username === nm.username;
            });
        },

        fn: function(old_row, match_row, next){
            match_row.sco_id = match_row.sco_id || '';
            var updated_url = old_row.url
                                .replace(/\?id=\d+/, '?id=' + match_row.cmid)
                                .replace(/cm=\d+/, 'cm=' + match_row.cmid)
                                .replace(/scoid=\d+/, 'scoid=' + match_row.sco_id);
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
                                "'" + match_row.scorm_id + "'"
                            ].join(',') +
                        ')';
            next && next(null, output);
        }
    },
    "view all": undefined
};

module.exports = library;

