package credentials

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/zalando/go-keyring"
)

func TestStoreLoadDeleteRoundtrip(t *testing.T) {
	keyring.MockInit()
	dir := t.TempDir()
	ConfigPath = filepath.Join(dir, "config.json")

	if err := Save("https://cms.example.com/", "lin_agent_ab12cd34_x"); err != nil {
		t.Fatalf("Save: %v", err)
	}
	// 配置文件只有 base_url，绝无 Token 明文
	raw, _ := os.ReadFile(ConfigPath)
	if strings.Contains(string(raw), "lin_agent_") {
		t.Fatalf("配置文件泄漏 Token：%s", raw)
	}

	creds, ok := Load()
	if !ok || creds.BaseURL != "https://cms.example.com" || creds.Token != "lin_agent_ab12cd34_x" {
		t.Fatalf("Load = %+v ok=%v", creds, ok)
	}
	if !Delete() {
		t.Fatal("Delete 应成功")
	}
	if _, ok := Load(); ok {
		t.Fatal("删除后不应再能加载")
	}
}

func TestEnvFallback(t *testing.T) {
	keyring.MockInit()
	t.Setenv("LIN_CMS_BASE_URL", "https://env.example.com")
	t.Setenv("LIN_CMS_AGENT_TOKEN", "lin_agent_env_token")
	creds, ok := Load()
	if !ok || creds.BaseURL != "https://env.example.com" || creds.Token != "lin_agent_env_token" {
		t.Fatalf("环境变量 fallback 失败：%+v", creds)
	}
}

func TestNothingStoredReturnsFalse(t *testing.T) {
	keyring.MockInit()
	ConfigPath = filepath.Join(t.TempDir(), "config.json")
	if _, ok := Load(); ok {
		t.Fatal("无凭证时应返回 false")
	}
}
