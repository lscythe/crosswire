package db

import (
	"testing"
	testingfstest "testing/fstest"
)

func TestLoadMigrationsSortsSQLFiles(t *testing.T) {
	files := testingfstest.MapFS{
		"0002_indexes.sql":    &testingfstest.MapFile{Data: []byte("second")},
		"0001_foundation.sql": &testingfstest.MapFile{Data: []byte("first")},
		"README.md":           &testingfstest.MapFile{Data: []byte("ignored")},
	}
	got, err := loadMigrations(files)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got[0].name != "0001_foundation.sql" || got[1].name != "0002_indexes.sql" {
		t.Fatalf("migrations = %#v", got)
	}
}
