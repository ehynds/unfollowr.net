window.app = (function(){

  // cache some re-used DOM notes/templates
  var target = $('#target'),
      body = $(document.body),
      tmplFriend = _.template( $('#tmplFriend').html() ),
      loading = $('#loading'),
      error = $('#error'),
      nav = $('nav'),
      footer = $('footer');

  var app = {

    // default rendering options
    mode: 'tpd',

    init: function(){
      $.getJSON('/twitter/get/').done($.proxy(this.render, this)).fail($.proxy(this.fail, this));
      body.delegate('.unfollow', 'click', $.proxy(this.unfollow, this));
      body.delegate('#sort', 'change', $.proxy(this.sort, this));
      body.delegate('nav .scroll', 'click', $.proxy(this.scroll, this));
    },

    render: function( friends ){

      // copy the data set to retain the original during chunking
      this.data || $.extend(true, this, {
        data: friends
      });

      // check for errors first
      if( this.data.statusCode ){
        error.show();
        loading.hide();
        nav.hide();
        return;
      }

      var data = $.extend(true, [], this.data),
          len = data.length,
          max = data[ len-1 ].tpd,
          counter = 0,
          mode = this.mode,
          self = this,
          ret;

      // prepare target
      target.empty();

      // sort data?
      if( mode !== 'tpd' ){
        data = _.sortBy(data, function( friend ){
          return friend && +friend[ mode ];
        });

        mode === 'dl' && data.reverse();
      }

      (function chunk(){
        var batch = data.splice(0, 50);

        ret = $.map(batch, function( friend ){
          return friend == null ? null : tmplFriend({
            index: ++counter,
            friend: friend,
            max: max,
            mode: mode
          });
        });

        target.append( ret.join('') );

        if( data.length ){
          setTimeout(chunk, 10);
        } else {
          self.done();
        }
      })();
    },

    fail: function(){
      alert('An error occurred trying to retreive your data.  Are you still logged into twitter?');
    },

    done: function(){
      loading.fadeOut('fast');
    },

    sort: function( event ){
      this.mode = event.target.value;
      this.render();
    },

    scroll: function( event ){
      event.preventDefault();

      body.add('html').animate({
        scrollTop: event.target.className.indexOf('top') > -1 ? 0 : footer.offset().top
      }, 'fast');
    },

    unfollow: function( event ){
      event.preventDefault();

      var target = event.target,
          data = this.data,
          sn = target.getAttribute('data-sn'),
          index = +target.getAttribute('data-index');

      if( !confirm('Unfollow @' + sn + '?') ){
        return;
      }

      $.getJSON('/twitter/unfollow/' + sn).done(function( resp ){
          if( resp === true ){
            $(target.parentNode).fadeOut('fast');
            data.splice( index, 1 );
          } else {
            alert('Unable to unfollow this user. Something about a ' + resp.statusCode + '.');
          }
      }).fail(function(){
        alert('An error occurred trying to unfollow this user.\n\nYou are probably no longer logged in; please refresh this page and try again.');
      });
    }
  };

  app.init();

  // public methods
  return {
    format: function( ts ){
      var date = new Date( ts );

      function pad( number ){
        return number < 10 ? '0'+number : number;
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
