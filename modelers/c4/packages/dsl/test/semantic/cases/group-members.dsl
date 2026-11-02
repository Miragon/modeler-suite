workspace {
    model {
        properties {
            "structurizr.groupSeparator" "/"
        }
        shop = softwareSystem "Shop"
        team = group "Team" {
            inner = group "Inner" {
                api = softwareSystem "API"
            }
            bank = element "Bank"
            !element shop {
                description "Moved into the group"
            }
            web = softwareSystem "Web"
        }
        bank -> web
    }
    views {
        systemLandscape "Team" {
            include team
        }
        systemLandscape "Inner" {
            include inner
        }
    }
}
