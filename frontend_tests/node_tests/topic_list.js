add_dependencies({
    Handlebars: 'handlebars',
    hash_util: 'js/hash_util',
    hashchange: 'js/hashchange',
    muting: 'js/muting',
    narrow: 'js/narrow',
    stream_data: 'js/stream_data',
    topic_data: 'js/topic_data',
    templates: 'js/templates',
});

set_global('unread', {});

var jsdom = require("jsdom");
var window = jsdom.jsdom().defaultView;
global.$ = require('jquery')(window);

var topic_list = require('js/topic_list.js');

global.compile_template('topic_list_item');

(function test_topic_list_build_widget() {
    var stream_id = 555;
    var active_topic = "testing";
    var max_topics = 5;

    topic_data.reset();
    topic_data.add_message({
        stream_id: stream_id,
        topic_name: 'coding',
        message_id: 400,
    });

    global.unread.num_unread_for_topic = function () {
        return 1;
    };

    global.stream_data.get_sub_by_id = function (stream_id) {
        assert.equal(stream_id, 555);
        return 'devel';
    };

    var parent_elem = $('<div>');
    var widget = topic_list.build_widget(parent_elem, stream_id, active_topic, max_topics);
    var topic_html = widget.get_dom();

    assert.equal(widget.get_parent(), parent_elem);
    assert.equal(widget.get_stream_id(), stream_id);

    var topic = $(topic_html).find('a').text().trim();
    assert.equal(topic, 'coding');

    global.write_test_output("test_topic_list_build_widget", parent_elem.html());
}());
