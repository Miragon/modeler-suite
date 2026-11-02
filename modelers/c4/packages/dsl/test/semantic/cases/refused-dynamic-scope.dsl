workspace {
    model {
        user = person "User"
        shop = softwareSystem "Shop" {
            web = container "Web"
        }
        user -> web "Browses"
    }
    views {
        dynamic * "Steps" {
            user -> web
        }
    }
}
