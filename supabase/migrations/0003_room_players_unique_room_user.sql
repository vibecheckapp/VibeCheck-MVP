-- Prevent duplicate room membership rows for the same user in the same room.
ALTER TABLE public.room_players
ADD CONSTRAINT room_players_room_id_user_id_unique UNIQUE (room_id, user_id);
