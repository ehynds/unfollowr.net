/*global module:false*/
module.exports = function(grunt) {
  var _ = grunt.util._;

  // Project configuration.
  grunt.initConfig({
    pkg: '<json:package.json>',

    clean: {
      all: ['client-dist/']
    },

    copy: {
      all: {
        files: [
          // everything except scss files
          { src: ['**', '!**/*.scss'], dest: 'client-dist', cwd: 'client/', expand: true }
        ]
      }
    },

    sass: {
      all: {
        files: {
          'client-dist/styles/style.css': 'client/styles/style.scss'
        },
        options: {
          style: 'compressed'
        }
      }
    },

    jst: {
      options: {
        processName: function(filename) {
          return filename.split('/').pop();
        }
      },
      compile: {
        files: {
          'client-dist/scripts/templates.js': [
            'client/templates/**/*.html'
          ]
        }
      }
    },

    concat: {
      options: {
        separator: ';'
      },
      all: {
        src: [
          'client-dist/scripts/templates.js',
          'client/scripts/libs/**/*.js',
          'client/scripts/app.js'
        ],
        dest: 'client-dist/scripts/app.js'
      }
    },

    uglify: {
      options: {
        preserveComments: 'some'
      },
      all: {
        files: {
          'client-dist/scripts/app.js': [
            'client-dist/scripts/app.js'
          ]
        }
      }
    },

    watch: {
      styles: {
        options: { interrupt: true },
        files: ['client/**/*.scss'],
        tasks: ['default']
      },
      scripts: {
        options: { interrupt: true },
        files: ['client/**/*.js'],
        tasks: ['default']
      }
    },

    jshint: {
      files: [
        'Gruntfile.js',
        'client/scripts/*.js',
        'server/**/*.js'
      ],
      options: {
        curly: true,
        loopfunc: true,
        eqeqeq: true,
        immed: true,
        latedef: true,
        newcap: true,
        noarg: true,
        sub: true,
        undef: true,
        boss: true,
        eqnull: true,
        browser: true,
        node: true,
        jquery: true,
        globals: {
          _: true,
          JST: true
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-contrib-sass');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-jst');

  grunt.registerTask('default', [
    'jshint',
    'clean',
    'copy',
    'sass',
    'jst',
    'concat'
  ]);

  grunt.registerTask('release', [
    'default',
    'uglify'
  ]);

};
