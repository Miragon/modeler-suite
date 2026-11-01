workspace {
    model {
        shop = softwareSystem "Shop"
    }
    views {
        systemContext shop "Context" {
            include *
            exclude shop
        }
    }
}
