workspace {
    model {
        user = person "User"
        shop = softwareSystem "Shop"
        user -> shop "Orders"
    }
    views {
        systemLandscape "Landscape" {
            include *
            animation {
                user
                shop
                user
            }
        }
    }
}
