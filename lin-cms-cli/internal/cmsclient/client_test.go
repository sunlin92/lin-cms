package cmsclient

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAuthHeaderAndEnvelopeError(t *testing.T) {
	var gotAuth string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		if r.URL.Path == "/api/v1/content/note" {
			w.WriteHeader(http.StatusForbidden)
			_, _ = w.Write([]byte(`{"message":"无权执行该内容操作","code":10310,"request":"GET  /x"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer srv.Close()
	c := New(srv.URL+"/", "lin_agent_ab12cd34_t")

	if _, err := c.Health(); err != nil {
		t.Fatalf("Health: %v", err)
	}
	if gotAuth != "Bearer lin_agent_ab12cd34_t" {
		t.Fatalf("认证头 = %q", gotAuth)
	}

	_, err := c.ListContentRecords("note", 0, 5)
	env, ok := err.(*EnvelopeError)
	if !ok || env.Code != 10310 {
		t.Fatalf("期望 EnvelopeError{10310}，得到 %v", err)
	}
}

func TestListContentRecordsClamps(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_, _ = w.Write([]byte(`{"items":[],"total":0}`))
	}))
	defer srv.Close()
	c := New(srv.URL, "lin_agent_x_y")
	if _, err := c.ListContentRecords("note", -3, 99); err != nil {
		t.Fatalf("请求失败：%v", err)
	}
	if gotQuery != "page=0&count=5" {
		t.Fatalf("分页参数未钳制：%s", gotQuery)
	}
}
