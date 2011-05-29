# replace these with your server's information
set :domain,  "69.164.222.103"
set :user,    "ehynds" 
set :port,     8486
set :application, "tweetstats.org" 
set :repository, "file://#{File.expand_path('.')}" 
set :deploy_via, :copy
set :copy_exclude, [".git", ".DS_Store"] 
set :scm, :git
set :deploy_to, "/home/#{user}/public_html/#{application}" 
set :use_sudo, false

server "#{domain}", :app, :web, :db, :primary => true 

# this tells capistrano what to do when you deploy
namespace :deploy do 
 
  task :default do 
    transaction do 
      update_code
      symlink
    end
  end
 
  task :update_code, :except => { :no_release => true } do 
    on_rollback { run "rm -rf #{release_path}; true" } 
    strategy.deploy! 
  end
 
  task :after_deploy do
    run "NODE_ENV=production forever restart 0"
  end
end
