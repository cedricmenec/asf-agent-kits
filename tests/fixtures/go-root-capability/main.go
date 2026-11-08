// Build-only portability probe for Go 1.25 os.Root.
// Does not read an application repository and never contacts a provider.
// This is an isolated pre-release qualification, not a production helper.
package main

import (
  "fmt"
  "os"
  "path/filepath"
)

func require(err error) {
  if err != nil { panic(err) }
}
func main() {
  dir, err := os.MkdirTemp("", "asf-portable-root-")
  require(err)
  defer os.RemoveAll(dir)
  root, err := os.OpenRoot(dir)
  require(err)
  defer root.Close()

  require(root.Mkdir("nested", 0700))
  f, err := root.OpenFile("nested/created", os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
  require(err)
  _, err = f.Write([]byte("data"))
  require(err)
  require(f.Sync())
  require(f.Close())

  info, err := root.Lstat("nested/created")
  require(err)
  if !info.Mode().IsRegular() { panic("expected regular file") }

  require(root.Rename("nested/created", "nested/renamed"))
  file, err := root.Open("nested/renamed")
  require(err)
  data := make([]byte, 4)
  n, err := file.Read(data)
  if err != nil && n != 4 { panic(err) }
  require(file.Close())
  if string(data[:n]) != "data" { panic("wrong bytes") }

  outside, err := os.MkdirTemp("", "asf-outside-")
  require(err)
  defer os.RemoveAll(outside)
  link := filepath.Join(dir, "nested", "escape")
  if err = os.Symlink(outside, link); err == nil {
    _, err = root.Open("nested/escape/foreign")
    if err == nil { panic("outside-root symlink unexpectedly followed") }
  }
  require(root.Remove("nested/renamed"))
  fmt.Println("portable os.Root capability probe: PASS")
}
