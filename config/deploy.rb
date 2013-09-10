# replace these with your server's information
set :domain,  "192.241.191.34"
set :user,    "ehynds" 
set :port,     8486
set :application, "unfollowr.net"
set :repository, "."
set :scm, :none
set :deploy_via, :copy
set :copy_exclude, [".git", ".DS_Store", "node_modules", ".sass-cache", "client", "*.dump", "*.log"]
set :deploy_to, "/home/#{user}/public_html/#{application}" 
set :use_sudo, false

server "#{domain}", :app, :web, :db, :primary => true 

# this tells capistrano what to do when you deploy
namespace :deploy do

  task :stop do
    run "forever stop #{current_path}/server/app.js"
  end

  task :start do
    run "mkdir -p #{release_path}/logs"
    run "cd #{current_path} && NODE_ENV=production forever start -a -o logs/out.log -e logs/error.log #{current_path}/server/app.js"
  end

  task :restart do
    stop
    sleep 15
    start
  end

  task :npm do
    run "cd #{release_path} && npm update && npm install --production"
  end

  task :sym_dirs do
    run "cd #{current_path}/public"
  end

end

after "deploy", "deploy:cleanup", "deploy:npm", "deploy:restart"
