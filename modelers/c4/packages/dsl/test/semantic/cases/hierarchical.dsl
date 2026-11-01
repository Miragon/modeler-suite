workspace {
    !identifiers hierarchical
    model {
        user = person "User"
        shop = softwareSystem "Shop" {
            web = container "Web" {
                login = component "Login"
                component "Session"
            }
            api = container "API" {
                -> web "Calls"
                this -> web.login "Logs in"
            }
            web -> api "Uses"
        }
        softwareSystem "Anonymous" {
            inner = container "Inner"
            container "Other" {
                -> inner "Reads"
            }
        }
        user -> shop.web "Browses"
    }
    views {
        container shop "Containers" {
            include *
        }
        component shop.web "Components" {
            include *
        }
    }
}
