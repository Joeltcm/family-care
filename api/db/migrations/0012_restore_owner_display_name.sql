UPDATE app_users
   SET display_name = 'Diógenes González',
       updated_at = now()
 WHERE lower(email) = 'joelbmx22@gmail.com'
   AND display_name <> 'Diógenes González';
