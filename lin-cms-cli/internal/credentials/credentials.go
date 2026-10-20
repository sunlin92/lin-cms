// Package credentials 管理本机凭证：Token 进系统凭证库（keyring），
// base_url 进非秘密配置文件；环境变量 fallback；绝不把 Token 明文写盘。
package credentials

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/zalando/go-keyring"
)

const (
	serviceName = "lin-cms"
	tokenEntry  = "agent-token"
	envBaseURL  = "LIN_CMS_BASE_URL"
	envAgentTok = "LIN_CMS_AGENT_TOKEN"
)

// Credentials 是一对可用的接入凭证。
type Credentials struct {
	BaseURL string
	Token   string
}

// ErrUnavailable 表示系统凭证库不可用；应提示改用环境变量。
var ErrUnavailable = errors.New("系统凭证库不可用：请安装/解锁系统钥匙串，或改用环境变量 LIN_CMS_BASE_URL 与 LIN_CMS_AGENT_TOKEN（不落盘）")

// ConfigPath 是 base_url 的非秘密配置文件位置（测试可覆盖）。
var ConfigPath = defaultConfigPath()

func defaultConfigPath() string {
	home, err := os.UserHomeDir()
	if err != nil {
		return "lin-cms-config.json"
	}
	return filepath.Join(home, ".config", "lin-cms", "config.json")
}

// SaveBaseURL 把非秘密的 base_url 写入配置文件。
func SaveBaseURL(baseURL string) error {
	if err := os.MkdirAll(filepath.Dir(ConfigPath), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(map[string]string{"base_url": baseURL})
	if err != nil {
		return err
	}
	return os.WriteFile(ConfigPath, data, 0o644)
}

// LoadBaseURL 读取配置文件里的 base_url；不存在返回空串。
func LoadBaseURL() string {
	data, err := os.ReadFile(ConfigPath)
	if err != nil {
		return ""
	}
	var parsed struct {
		BaseURL string `json:"base_url"`
	}
	if json.Unmarshal(data, &parsed) != nil {
		return ""
	}
	return strings.TrimRight(parsed.BaseURL, "/")
}

// Save 把凭证写入系统凭证库（token）与配置文件（base_url）。
func Save(baseURL, token string) error {
	baseURL = strings.TrimRight(baseURL, "/")
	if err := keyring.Set(serviceName, tokenEntry, token); err != nil {
		return fmt.Errorf("%w（keyring: %v）", ErrUnavailable, err)
	}
	return SaveBaseURL(baseURL)
}

// Load 依次尝试环境变量、系统凭证库；不齐全时返回 false。
func Load() (Credentials, bool) {
	envTok := strings.TrimSpace(os.Getenv(envAgentTok))
	envURL := strings.TrimSpace(os.Getenv(envBaseURL))
	if envTok != "" && envURL != "" {
		return Credentials{BaseURL: strings.TrimRight(envURL, "/"), Token: envTok}, true
	}
	token, err := keyring.Get(serviceName, tokenEntry)
	if err != nil || token == "" {
		return Credentials{}, false
	}
	baseURL := strings.TrimRight(envURL, "/")
	if baseURL == "" {
		baseURL = LoadBaseURL()
	}
	if baseURL == "" {
		return Credentials{}, false
	}
	return Credentials{BaseURL: baseURL, Token: token}, true
}

// Delete 删除系统凭证库中的 Token；返回是否删除成功。
func Delete() bool {
	return keyring.Delete(serviceName, tokenEntry) == nil
}
