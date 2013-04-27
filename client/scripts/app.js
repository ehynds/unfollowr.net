window.app = (function() {
  // cache some re-used DOM notes/templates
  var tmplFriend = _.template($('#tmplFriend').html());
  var $target = $('#target');
  var $body = $(document.body);
  var $loading = $('#loading');
  var $error = $('#error');
  var $nav = $('nav');
  var $footer = $('footer');

  var app = {
    // default rendering options
    // TODO make constants
    mode: 'tpd',

    init: function() {
      $.getJSON('/twitter/get/')
        .done(_.bind(this.render, this))
        .fail(_.bind(this.fail, this));

      $body.on('click', '.unfollow', _.bind(this.unfollow, this));
      $body.on('click', 'nav .scroll', _.bind(this.scroll, this));
      $body.on('change', '#sort', _.bind(this.sort, this));
    },

    render: function(data) {
      // copy the data set to retain the original during chunking
      this.data || $.extend(true, this, {
        data: data
      });

      // check for errors first
      if(this.data.statusCode || this.data.message) {
        $error.fadeIn("fast");
        $loading.fadeOut("fast");
        $nav.fadeOut("fast");
        return;
      }

      var data = $.extend(true, [], this.data);
      var len = data.length;
      var max = data[len - 1].tpd;
      var counter = 0;
      var mode = this.mode;
      var self = this;
      var ret;

      // prepare target
      $target.empty();

      // sort data?
      if(mode !== 'tpd') {
        data = _.sortBy(data, function(friend) {
          return friend && +friend[mode];
        });

        mode === 'dl' && data.reverse();
      }

      // render in chunks to prevent timeout errors
      (function chunk() {
        var batch = data.splice(0, 50);

        ret = $.map(batch, function(friend) {
          return friend == null ? null : tmplFriend({
            index: ++counter,
            friend: friend,
            max: max,
            mode: mode
          });
        });

        $target.append(ret.join(''));

        if(data.length) {
          setTimeout(chunk, 10);
        } else {
          self.done();
        }
      })();
    },

    fail: function(){
      alert('An error occurred trying to retreive your data. Are you still logged into twitter?');
    },

    done: function(){
      $loading.fadeOut('fast');
    },

    sort: function(event) {
      this.mode = event.target.value;
      this.render();
    },

    scroll: function(event) {
      event.preventDefault();

      $body.add('html').animate({
        scrollTop: event.target.className.indexOf('top') > -1 ? 0 : $footer.offset().top
      }, 'fast');
    },

    unfollow: function(event) {
      event.preventDefault();

      var target = event.currentTarget;
      var data = this.data;
      var sn = target.getAttribute('data-sn');
      var index = +target.getAttribute('data-index');

      if(!confirm('Unfollow @' + sn + '?')) {
        return;
      }

      $.getJSON('/twitter/unfollow/' + sn).done(function(resp) {
          if(resp === true) {
            $(target.parentNode).fadeOut('fast');
            data.splice(index, 1);
          } else {
            alert('Unable to unfollow this user. Something about a ' + resp.statusCode + '.');
          }
      }).fail(function() {
        alert('An error occurred trying to unfollow this user.\n\nYou are probably no longer logged in; please refresh this page and try again.');
      });
    }
  };

  // kick this thing off
  app.init();

  // public methods
  return {
    format: function(ts) {
      var date = new Date(ts);

      function pad(number) {
        return number < 10 ? ('0' + number) : number;
      }

      return 'mm-dd-yyyy'.replace(/(\w+)/g, function( part ){
        return part === 'mm'
        ? pad(date.getMonth() + 1) : part === 'dd'
        ? pad(date.getDate()) : part === 'yyyy'
        ? date.getFullYear() : '';
      });
    },
  }
})();
