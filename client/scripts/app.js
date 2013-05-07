/* global alert, confirm */
window.app = (function() {

  // Cache some re-used DOM notes/templates
  var tmplRow = JST['row.html'];
  var $target = $('#target');
  var $body = $(document.body);
  var $loading = $('#loading');
  var $error = $('#error');
  var $nav = $('nav');
  var $footer = $('footer');

  // Consts
  var RENDER_MODE_TWEETS_PER_DAY = 'tpd';
  var RENDER_MODE_DAYS_SINCE_LAST_TWEET = 'dl';
  var RENDER_MODE_TOTAL_TWEETS = 't';

  // Create namespace
  var app = {

    // Default rendering mode
    mode: RENDER_MODE_TWEETS_PER_DAY,

    // Initialization function
    init: function() {
      $.getJSON('/twitter/get/')
        .done(_.bind(this.render, this))
        .fail(_.bind(this.fail, this));

      $body.on('click', '.unfollow', _.bind(this.unfollow, this));
      $body.on('click', 'nav .scroll', _.bind(this.scroll, this));
      $body.on('change', '#sort', _.bind(this.sort, this));
    },

    render: function(data) {
      // Copy the data set to retain the original during chunking
      if(this.data == null) {
        $.extend(true, this, {
          data: data
        });
      }

      // Check for & handle any server errors first
      if(this.data.statusCode || this.data.message) {
        $error.fadeIn('fast');
        $loading.fadeOut('fast');
        $nav.fadeOut('fast');
        return;
      }

      // Create a local copy of the data so we can alter it
      data = $.extend(true, [], this.data);

      var len = data.length;
      var max = data[len - 1].RENDER_MODE_TWEETS_PER_DAY;
      var counter = 0;
      var mode = this.mode;
      var self = this;
      var ret;

      // Prepare target
      $target.empty();

      // Sort data if it's not the default. Data will come back sorted
      // already.
      if(mode !== RENDER_MODE_TWEETS_PER_DAY) {
        data = _.sortBy(data, function(friend) {
          return friend && parseFloat(friend[mode]);
        });

        if(mode === RENDER_MODE_DAYS_SINCE_LAST_TWEET) {
          data.reverse();
        }
      }

      // Render in chunks to prevent timeout errors with large data
      // sets (looking at you, IE)
      (function chunk() {
        var batch = data.splice(0, 50);
        var ret;

        // Remove any null/undef friends
        ret = _.reject(batch, function(friend) {
          return friend == null;
        });

        // Create an array of HTML rows
        ret = _.map(ret, function(friend) {
          return tmplRow({
            index: ++counter,
            friend: friend,
            max: max,
            mode: mode
          });
        });

        // Inject into the DOM
        $target.append(ret.join(''));

        // Keep on chunking if there's more data to go through.
        if(data.length) {
          setTimeout(chunk, 10);
        } else {
          self.done();
        }
      })();
    },

    fail: function() {
      alert('An error occurred trying to retreive your data. Are you still logged into twitter?');
    },

    done: function() {
      $loading.fadeOut('fast');
    },

    sort: function(event) {
      this.mode = event.currentTarget.value;
      this.render();
      this._scroll('top');
    },

    scroll: function(event) {
      event.preventDefault();
      this._scroll(event.currentTarget.className.indexOf('top') > -1 ? 'top' : 'bottom');
    },

    _scroll: function(direction) {
      $body.add('html').animate({
        scrollTop: direction === 'top' ?  0 : $footer.offset().top
      }, 'fast');
    },

    unfollow: function(event) {
      event.preventDefault();

      var $target = $(event.currentTarget);
      var data = this.data;
      var sn = $target.data('sn');
      var index = $target.data('index');

      if(!confirm('Unfollow @' + sn + '?')) {
        return;
      }

      $.getJSON('/twitter/unfollow/' + sn).done(function(res) {
          if(res === true) {
            $target.parent().fadeOut('fast');
            data.splice(index, 1);
          } else {
            if(res.statusCode === 401 && confirm('You are no longer signed into Twitter. Continue to login?')) {
              window.location = '/twitter/connect';
            } else {
              alert('Unable to unfollow this user: ' + res.error + '.');
            }
          }
      }).fail(function() {
        alert('An error occurred trying to unfollow this user.\n\nYou are probably no longer logged in; please refresh this page and try again.');
      });
    }
  };

  // Kick this thing off
  app.init();

  // Expose public methods
  return (function() {
    function pad(number) {
      return number < 10 ? ('0' + number) : number;
    }

    return {
      format: function(ts) {
        var date = new Date(ts);

        return 'mm-dd-yyyy'.replace(/(\w+)/g, function(part) {
          return part === 'mm' ?
            pad(date.getMonth() + 1) : part === 'dd' ?
            pad(date.getDate()) : part === 'yyyy' ?
            date.getFullYear() : '';
        });
      }
    };
  })();

})();
