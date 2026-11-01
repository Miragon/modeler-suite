workspace {
    !identifiers hierarchical
    model {
        user = person "User"
        team = group "Team" {
            other = softwareSystem "Other"
        }
        shop = softwareSystem "Shop" {
            backend = group "Backend" {
                api = container "API"
                db = container "Database"
            }
            web = container "Web"
        }
        user -> shop.web "Browses"
        shop.web -> shop.api "Calls"
        shop.api -> shop.db "Reads"
        shop.api -> other "Notifies"
    }
    views {
        container shop "Backend" {
            include shop.backend
        }
        systemLandscape "Landscape" {
            include team user
        }
    }
}
