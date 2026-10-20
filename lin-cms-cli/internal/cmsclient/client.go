// Package cmsclient 封装对 CMS REST API（/health 与 /api/v1/**）的访问。
package cmsclient

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
)

// EnvelopeError 承载后端信封错误 {message, code}（code>=9998 为失败）。
type EnvelopeError struct {
	Code    int
	Message string
}

func (e *EnvelopeError) Error() string {
	return fmt.Sprintf("code=%d: %s", e.Code, e.Message)
}

// Client 是带 Agent Token 认证的 CMS 客户端。
type Client struct {
	baseURL string
	token   string
	http    *http.Client
}

// New 构造客户端；baseURL 去尾斜杠。
func New(baseURL, token string) *Client {
	return &Client{
		baseURL: trimSlash(baseURL),
		token:   token,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func trimSlash(s string) string {
	for len(s) > 0 && s[len(s)-1] == '/' {
		s = s[:len(s)-1]
	}
	return s
}

// do 发请求并把 JSON 响应解到 out；非 2xx 或信封失败码转为 EnvelopeError。
func (c *Client) do(method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	var envelope struct {
		Message string `json:"message"`
		Code    int    `json:"code"`
	}
	_ = json.Unmarshal(raw, &envelope)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 || (envelope.Code != 0 && envelope.Code >= 9998) {
		msg := envelope.Message
		if msg == "" {
			msg = "HTTP " + strconv.Itoa(resp.StatusCode)
		}
		code := envelope.Code
		if code == 0 {
			code = resp.StatusCode
		}
		return &EnvelopeError{Code: code, Message: msg}
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(raw, out)
}

// Health 探测 /health。
func (c *Client) Health() (map[string]any, error) {
	var out map[string]any
	if err := c.do(http.MethodGet, "/health", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ListContentTypes GET /api/v1/content-types/available。
func (c *Client) ListContentTypes() ([]map[string]any, error) {
	var out []map[string]any
	if err := c.do(http.MethodGet, "/api/v1/content-types/available", nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// ListContentRecords GET /api/v1/content/{type_key}（page 0 起、count 1..15）。
func (c *Client) ListContentRecords(typeKey string, page, count int) (map[string]any, error) {
	if page < 0 {
		page = 0
	}
	if count < 1 || count > 15 {
		count = 5
	}
	var out map[string]any
	path := fmt.Sprintf("/api/v1/content/%s?page=%d&count=%d", typeKey, page, count)
	if err := c.do(http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// GetContentRecord GET /api/v1/content/{type_key}/{record_id}。
func (c *Client) GetContentRecord(typeKey string, recordID int) (map[string]any, error) {
	var out map[string]any
	path := fmt.Sprintf("/api/v1/content/%s/%d", typeKey, recordID)
	if err := c.do(http.MethodGet, path, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// CreateContentRecord POST /api/v1/content/{type_key}。
func (c *Client) CreateContentRecord(typeKey string, data map[string]any) (map[string]any, error) {
	var out map[string]any
	path := fmt.Sprintf("/api/v1/content/%s", typeKey)
	if err := c.do(http.MethodPost, path, data, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// UpdateContentRecord PATCH /api/v1/content/{type_key}/{record_id}。
func (c *Client) UpdateContentRecord(typeKey string, recordID int, patch map[string]any) (map[string]any, error) {
	var out map[string]any
	path := fmt.Sprintf("/api/v1/content/%s/%d", typeKey, recordID)
	if err := c.do(http.MethodPatch, path, patch, &out); err != nil {
		return nil, err
	}
	return out, nil
}

// DeleteContentRecord DELETE /api/v1/content/{type_key}/{record_id}。
func (c *Client) DeleteContentRecord(typeKey string, recordID int) (map[string]any, error) {
	var out map[string]any
	path := fmt.Sprintf("/api/v1/content/%s/%d", typeKey, recordID)
	if err := c.do(http.MethodDelete, path, nil, &out); err != nil {
		return nil, err
	}
	return out, nil
}
