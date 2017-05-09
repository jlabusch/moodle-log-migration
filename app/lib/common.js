
exports.make_alias = function(library, this_action, from_action){
    Object.keys(library[from_action]).forEach((x) => {
        if (library[this_action][x] === undefined){
            if (x === 'sql_old'){
                // changed to match only whole words, 
                // used to match 'mdl_quiz_attempts'  and change it to 'mdl_quiz_close attempts' for from_action == 'attempt' and this_action = 'close attempt'
                library[this_action][x] = library[from_action][x].replace(new RegExp("\\b"+from_action), this_action);
            }else{
                library[this_action][x] = library[from_action][x]
            }
        }
    });
}

exports.fix_by_match_index = function(log_row, old_matches, new_matches, cmp){
    if (!new_matches){
        //console.log('fix_by_match_index -> no new rows');
        return null;
    }
    var pos = -1;
    new_matches.forEach((m, i) => {
        if (cmp(log_row, m)){
            pos = i;
        }
    });
    if (pos < 0){
        //console.log('fix_by_match_index -> matching failed');
        return null;
    }
    return new_matches[pos];
}

exports.fix_by_shadow_index = function(log_row, old_matches, new_matches, cmp){
    if (!new_matches || old_matches.length > new_matches.length){
        //console.log('fix_by_shadow_index -> too few new rows');
        return null;
    }
    var pos = -1;
    old_matches.forEach((m, i) => {
        if (cmp(log_row, m)){
            pos = i;
        }
    });
    if (pos < 0){
        //console.log('fix_by_shadow_index -> impossible inconsistency in old matches');
        return null;
    }
    return new_matches[pos];
}

