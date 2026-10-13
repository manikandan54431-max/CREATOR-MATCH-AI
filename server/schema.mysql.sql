CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(120) NOT NULL PRIMARY KEY,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL PRIMARY KEY,
  display_name VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(16) NOT NULL,
  bio VARCHAR(600) NOT NULL DEFAULT '',
  specialization VARCHAR(100) NOT NULL DEFAULT '',
  skills JSON NOT NULL,
  tools JSON NOT NULL,
  avatar_url VARCHAR(2048) NULL,
  company_name VARCHAR(100) NOT NULL DEFAULT '',
  company_website VARCHAR(300) NOT NULL DEFAULT '',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY profiles_email_unique (email),
  KEY profiles_role_created_idx (role, created_at),
  CONSTRAINT profiles_role_check CHECK (role IN ('creator', 'brand', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL,
  user_id CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY sessions_token_unique (token_hash),
  KEY sessions_user_expiry_idx (user_id, expires_at),
  CONSTRAINT sessions_user_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portfolio_items (
  id CHAR(36) NOT NULL PRIMARY KEY,
  creator_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  media_type VARCHAR(20) NOT NULL,
  tool_used VARCHAR(100) NOT NULL DEFAULT '',
  external_url VARCHAR(500) NOT NULL DEFAULT '',
  media_url VARCHAR(2048) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY portfolio_creator_created_idx (creator_id, created_at),
  CONSTRAINT portfolio_creator_fk FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creative_briefs (
  id CHAR(36) NOT NULL PRIMARY KEY,
  brand_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(3000) NOT NULL,
  target_audience VARCHAR(300) NOT NULL DEFAULT '',
  deliverables VARCHAR(1000) NOT NULL,
  content_type VARCHAR(20) NOT NULL DEFAULT 'video',
  style_direction VARCHAR(500) NOT NULL DEFAULT '',
  platform VARCHAR(100) NOT NULL DEFAULT '',
  budget DECIMAL(12,2) NULL,
  deadline DATE NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY briefs_brand_created_idx (brand_id, created_at),
  KEY briefs_status_idx (status),
  CONSTRAINT briefs_brand_fk FOREIGN KEY (brand_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_invitations (
  id CHAR(36) NOT NULL PRIMARY KEY,
  brand_id CHAR(36) NOT NULL,
  creator_id CHAR(36) NOT NULL,
  brief_id CHAR(36) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  response_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY invitations_brief_creator_unique (brief_id, creator_id),
  KEY invitations_brand_created_idx (brand_id, created_at),
  KEY invitations_creator_created_idx (creator_id, created_at),
  CONSTRAINT invitations_brand_fk FOREIGN KEY (brand_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT invitations_creator_fk FOREIGN KEY (creator_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT invitations_brief_fk FOREIGN KEY (brief_id) REFERENCES creative_briefs(id) ON DELETE CASCADE,
  CONSTRAINT invitations_not_self_check CHECK (brand_id <> creator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_request_limits (
  user_id CHAR(36) NOT NULL PRIMARY KEY,
  window_started_at DATETIME(3) NOT NULL,
  request_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT ai_request_limits_user_fk FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS project_messages (
  id CHAR(36) NOT NULL PRIMARY KEY,
  invitation_id CHAR(36) NOT NULL,
  sender_id CHAR(36) NOT NULL,
  body VARCHAR(2000) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY project_messages_invitation_created_idx (invitation_id, created_at),
  CONSTRAINT project_messages_invitation_fk FOREIGN KEY (invitation_id) REFERENCES project_invitations(id) ON DELETE CASCADE,
  CONSTRAINT project_messages_sender_fk FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
