workspace {
    model {
        a = softwareSystem "A" {
            url "https://example.com/a"
        }
        b = softwareSystem "B" {
            url "{workspace}/diagrams#Landscape"
        }
        c = softwareSystem "C" {
            url ""
        }
        d = softwareSystem "D" {
            url "mailto:team@example.com"
        }
        a -> b "Uses" {
            url "https://example.com/uses"
        }
    }
}
