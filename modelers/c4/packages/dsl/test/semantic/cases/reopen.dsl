workspace {
    model {
        a = softwareSystem "A" "First"
        b = softwareSystem "B" {
            description "Set in the block"
            tags "One"
            url "https://example.com/b"
        }
        r = a -> b "Uses" "HTTP" "Sync"
        !element a {
            description "Reopened"
            tag "Two"
            properties {
                "owner" "team-a"
            }
            container "Added later"
        }
        !element "SoftwareSystem://B" {
            tags "Three,Four"
            -> a "Calls back"
        }
        !relationship r {
            tags "Reopened"
            url "https://example.com/r"
        }
    }
}
