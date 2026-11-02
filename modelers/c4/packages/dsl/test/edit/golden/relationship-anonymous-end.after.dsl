workspace {
    model {
        visitor = person "Visitor"
        shop = softwareSystem "Shop"
        visitor -> shop
    }
    views {
        systemLandscape "Landscape" {
            include *
            autoLayout tb 300 160
        }
    }
}
