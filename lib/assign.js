var restrict_clause = require('./sql_restrictions.js')(),
    make_alias = require('./common.js').make_alias,
    bogus_email = require('./common.js').bogus_email,
    fix_by_shadow_index = require('./common.js').fix_by_shadow_index,
    fix_by_match_index = require('./common.js').fix_by_match_index,
    mysql = require('mysql');

/*
mysql> select action,count(*) from mdl_log where module='assign' group by action;
+-------------------------------+----------+
| action                        | count(*) |
+-------------------------------+----------+
| add                           |      315 |
| download all submissions      |       14 |
| grade submission              |     3201 |
| lock submission               |       14 |
| revert submission to draft    |       13 |
| submit                        |     3308 |
| submit for grading            |     1193 |
| unlock submission             |       58 |
| update                        |     5665 |
| update grades                 |     3319 |
| upload                        |     3968 |
| view                          |   133184 |
| view all                      |     1410 |
| view feedback                 |      599 |
| view grading form             |     3972 |
| view submission               |     8023 |
| view submission grading table |     9930 |
| view submit assignment form   |     4975 |
+-------------------------------+----------+
*/

var library = {
    "submit": undefined
        /*
        | userid | course | cmid | url              | info              |
        +--------+--------+------+------------------+-------------------+
        |   1296 |    103 | 9757 | view.php?id=9757 | <html text>       |

        cmid doesn't relate to mdl_assign.id or mdl_assign_submission.id (in our dataset?).
        Need to read some code...
        */
};

module.exports = library;

