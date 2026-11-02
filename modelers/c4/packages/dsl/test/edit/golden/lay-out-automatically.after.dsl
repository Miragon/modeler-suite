workspace "Shop" {
    model {
        customer = person "Customer"
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
    }
    views {
        systemLandscape "Landscape" {
            include *
        }
    }
}
