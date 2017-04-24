/*
mysql> select action,count(*) from mdl_log where module='assignment' group by action;
+-----------------+----------+
| action          | count(*) |
+-----------------+----------+
| add             |       27 |
| update          |       65 |
| update grades   |        3 |
| upload          |      240 |
| view            |     2399 |
| view all        |     8966 |
| view submission |      159 |
+-----------------+----------+

Unfortunately, the mdl_assignment table is pretty much empty.

mysql> select id,course,name from mdl_assignment;
+----+--------+----------------------------------+
| id | course | name                             |
+----+--------+----------------------------------+
|  1 |    192 | Logistix 7 Installation          |
|  2 |    192 | Logistix 7 Navigation            |
|  3 |    192 | Logistix 7 Configuration         |
|  4 |    192 | Creating Documents OUT (PCM)     |
|  5 |    192 | Making Receptions                |
|  6 |    192 | Stock management                 |
|  7 |    192 | Declaring a Request              |
|  8 |    192 | Routing                          |
|  9 |    192 | Declaring a Reception            |
| 10 |    192 | Packing List & Freight Manifests |
| 11 |    192 | Make a Backup                    |
| 12 |    192 | Restore a Data File              |
| 13 |    192 | Update with ITC starting Data    |
| 14 |    192 | Final task                       |
+----+--------+----------------------------------+

Since mdl_assignment is only really pre-2.3, let's ignore it.

Also, cmid for action="view" never matches up to any existing mdl_course_modules.id
*/

module.exports = {};

