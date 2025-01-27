import $ from "jquery";

import render_search_list_item from "../templates/search_list_item.hbs";

import {Filter} from "./filter";
import * as keydown_util from "./keydown_util";
import * as message_view_header from "./message_view_header";
import * as narrow from "./narrow";
import * as narrow_state from "./narrow_state";
import {page_params} from "./page_params";
import * as search_pill from "./search_pill";
import * as search_pill_widget from "./search_pill_widget";
import * as search_suggestion from "./search_suggestion";
import * as ui_util from "./ui_util";

// Exported for unit testing
export let is_using_input_method = false;

export function narrow_or_search_for_term(search_string) {
    const $search_query_box = $("#search_query");
    if (is_using_input_method) {
        // Neither narrow nor search when using input tools as
        // `updater` is also triggered when 'enter' is triggered
        // while using input tool
        return $search_query_box.val();
    }

    let operators;
    if (page_params.search_pills_enabled) {
        // We have to take care to append the new pill before calling this
        // function, so that the base_query includes the suggestion selected
        // along with query corresponding to the existing pills.
        const base_query = search_pill.get_search_string_for_current_filter(
            search_pill_widget.widget,
        );
        operators = Filter.parse(base_query);
    } else {
        operators = Filter.parse(search_string);
    }
    narrow.activate(operators, {trigger: "search"});

    // It's sort of annoying that this is not in a position to
    // blur the search box, because it means that Esc won't
    // unnarrow, it'll leave the searchbox.

    // Narrowing will have already put some operators in the search box,
    // so leave the current text in.
    if (!page_params.search_pills_enabled) {
        $search_query_box.trigger("blur");
    }
    return $search_query_box.val();
}

function update_buttons_with_focus(focused) {
    const $search_query_box = $("#search_query");

    // Show buttons iff the search input is focused, or has non-empty contents,
    // or we are narrowed.
    if (focused || $search_query_box.val() || narrow_state.active()) {
        $(".search_close_button").prop("disabled", false);
    }
}

export function update_button_visibility() {
    update_buttons_with_focus($("#search_query").is(":focus"));
}

export function initialize() {
    const $search_query_box = $("#search_query");
    const $searchbox_form = $("#searchbox_form");
    const $searchbox = $("#searchbox");

    // Data storage for the typeahead.
    // This maps a search string to an object with a "description_html" field.
    // (It's a bit of legacy that we have an object with only one important
    // field.  There's also a "search_string" field on each element that actually
    // just represents the key of the hash, so it's redundant.)
    let search_map = new Map();

    $search_query_box.typeahead({
        source(query) {
            let base_query = "";
            if (page_params.search_pills_enabled) {
                base_query = search_pill.get_search_string_for_current_filter(
                    search_pill_widget.widget,
                );
            }
            const suggestions = search_suggestion.get_suggestions(base_query, query);
            // Update our global search_map hash
            search_map = suggestions.lookup_table;
            return suggestions.strings;
        },
        parentElement: "#searchbox_legacy",
        items: search_suggestion.max_num_of_search_results,
        helpOnEmptyStrings: true,
        // With search pills, the contenteditable input will be empty
        // even if some pills are present.
        hideOnEmpty: page_params.search_pills_enabled,
        naturalSearch: true,
        highlighter(item) {
            const obj = search_map.get(item);
            return render_search_list_item(obj);
        },
        matcher() {
            return true;
        },
        updater(search_string) {
            if (page_params.search_pills_enabled) {
                search_pill.append_search_string(search_string, search_pill_widget.widget);
                return $search_query_box.val();
            }
            return narrow_or_search_for_term(search_string);
        },
        sorter(items) {
            return items;
        },
        stopAdvance: page_params.search_pills_enabled,
        advanceKeyCodes: [8],

        on_move() {
            if (page_params.search_pills_enabled) {
                ui_util.place_caret_at_end($search_query_box[0]);
            }
        },
        // Use our custom typeahead `on_escape` hook to exit
        // the search bar as soon as the user hits Esc.
        on_escape: message_view_header.exit_search,
    });

    $searchbox_form.on("compositionend", () => {
        // Set `is_using_input_method` to true if Enter is pressed to exit
        // the input tool popover and get the text in the search bar. Then
        // we suppress searching triggered by this Enter key by checking
        // `is_using_input_method` before searching.
        // More details in the commit message that added this line.
        is_using_input_method = true;
    });

    $searchbox_form
        .on("keydown", (e) => {
            update_button_visibility();
            if (keydown_util.is_enter_event(e) && $search_query_box.is(":focus")) {
                // Don't submit the form so that the typeahead can instead
                // handle our Enter keypress. Any searching that needs
                // to be done will be handled in the keyup.
                e.preventDefault();
            }
        })
        .on("keyup", (e) => {
            if (is_using_input_method) {
                is_using_input_method = false;
                return;
            }

            if (keydown_util.is_enter_event(e) && $search_query_box.is(":focus")) {
                // We just pressed Enter and the box had focus, which
                // means we didn't use the typeahead at all.  In that
                // case, we should act as though we're searching by
                // operators.  (The reason the other actions don't call
                // this codepath is that they first all blur the box to
                // indicate that they've done what they need to do)

                // Pill is already added during keydown event of input pills.
                narrow_or_search_for_term($search_query_box.val());
                $search_query_box.trigger("blur");
                update_buttons_with_focus(false);
            }
        });

    // Some of these functions don't actually need to be exported,
    // but the code was moved here from elsewhere, and it would be
    // more work to re-order everything and make them private.

    $search_query_box.on("focus", focus_search);
    $search_query_box.on("blur", (e) => {
        // The search query box is a visual cue as to
        // whether search or narrowing is active.  If
        // the user blurs the search box, then we should
        // update the search string to reflect the current
        // narrow (or lack of narrow).
        //
        // But we can't do this right away, because
        // selecting something in the typeahead menu causes
        // the box to lose focus a moment before.
        //
        // The workaround is to check 100ms later -- long
        // enough for the search to have gone through, but
        // short enough that the user won't notice (though
        // really it would be OK if they did).

        if (page_params.search_pills_enabled) {
            const $element = $(e.relatedTarget).closest(".pill");
            const search_pill = search_pill_widget.widget.getByElement($element[0]);
            if (search_pill) {
                // The searchbox loses focus while the search
                // pill element gains focus.
                // We do not consider the searchbox to actually
                // lose focus when a pill inside it gets selected
                // or deleted by a click.
                return;
            }
        }
        setTimeout(() => {
            update_button_visibility();
        }, 100);
    });

    if (page_params.search_pills_enabled) {
        // Uses jquery instead of pure css as the `:focus` event occurs on `#search_query`,
        // while we want to add box-shadow to `#searchbox`. This could have been done
        // with `:focus-within` CSS selector, but it is not supported in IE or Opera.
        $searchbox.on("focusout", () => {
            message_view_header.close_search_bar_and_open_narrow_description();
            $searchbox.css({"box-shadow": "unset"});
        });
    }
}

export function focus_search() {
    // The search bar is not focused yet, but will be.
    update_buttons_with_focus(true);
}

export function initiate_search() {
    message_view_header.open_search_bar_and_close_narrow_description();
    $("#searchbox").css({"box-shadow": "inset 0px 0px 0px 2px hsl(204, 20%, 74%)"});
    $("#search_query").typeahead("lookup").trigger("select");
    if (page_params.search_pills_enabled) {
        $("#search_query").trigger("focus");
        ui_util.place_caret_at_end($("#search_query")[0]);
    }
}

export function clear_search_form() {
    $("#search_query").val("");
    $("#search_query").trigger("blur");
    $(".search_close_button").prop("disabled", true);
}
