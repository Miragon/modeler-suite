workspace {
    model {
        customer = person "Customer"
 
        shop = softwareSystem "Shop"
        customer -> shop "Uses"
    }
}
